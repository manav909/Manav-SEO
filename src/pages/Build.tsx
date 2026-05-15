/* ═══════════════════════════════════════════════════════════
   src/pages/Build.tsx — King's Command Dashboard

   Full-screen empire build monitor. No auth gate (internal tool).
   Polls /api/bridge every 20 s. Shows module checklist, live feed,
   usage stats, and Pause/Resume controls.
═══════════════════════════════════════════════════════════ */

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  RefreshCw, Loader2, Crown, Radio, Terminal, MessageSquare,
  ChevronDown, ChevronUp, GitCommit, Code2,
  DollarSign, Activity, Pause, Play,
  Clock, X,
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

type ModStatus = "pending" | "building" | "testing" | "done" | "blocked" | "paused";

interface BridgeMsg {
  id:          string;
  kind:        string;          // instruction | response | status | dump | note | request
  title:       string | null;
  body:        string;
  metadata:    Record<string, any>;
  created_by:  string;          // claude_code | claude_chat | manav
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
  today_usd:    number;
  month_usd:    number;
  month_tasks:  number;
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
const CONTEXT_WARN   = 0.70;
const CONTEXT_DANGER = 0.90;

/* ═══════════════════════════════════════════════════════════
   Palette
═══════════════════════════════════════════════════════════ */

const C = {
  bg:       "#0a0a0f",
  card:     "#12121a",
  border:   "#1e1e2e",
  text:     "#e2e2e8",
  muted:    "#6b6b80",
  green:    "#22c55e",
  blue:     "#3b82f6",
  yellow:   "#eab308",
  red:      "#ef4444",
  orange:   "#f97316",
  gray:     "#4b5563",
  purple:   "#a855f7",
  cyan:     "#06b6d4",
  indigo:   "#6366f1",
  teal:     "#14b8a6",
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
  instruction: { color: C.indigo, label: "instruction" },
  response:    { color: C.teal,   label: "response"    },
  status:      { color: C.gray,   label: "status"      },
  dump:        { color: "#374151", label: "brain_dump" },
  note:        { color: C.cyan,   label: "note"        },
  request:     { color: C.orange, label: "question"    },
  message:     { color: C.gray,   label: "message"     },
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

/** Derive module-level status from its messages (newest first). */
function deriveModuleStatus(msgs: BridgeMsg[]): ModStatus {
  if (!msgs.length) return "pending";
  const latest = msgs[0]; // already sorted newest-first
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

/** Build moduleMap: num → messages (newest first) */
function buildModuleMap(messages: BridgeMsg[]): Record<number, BridgeMsg[]> {
  const map: Record<number, BridgeMsg[]> = {};
  for (const m of messages) {
    const num = Number(m.metadata?.module_num);
    if (num >= 1 && num <= 12) {
      if (!map[num]) map[num] = [];
      map[num].push(m);
    }
  }
  // Sort each list newest-first
  for (const k of Object.keys(map)) {
    map[Number(k)].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }
  return map;
}

/** Extract tasks for a module (unique task names with status). */
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

/** Find the most-active pending/executing message across all modules. */
function findActiveTask(messages: BridgeMsg[]): BridgeMsg | null {
  const sorted = [...messages].sort((a, b) =>
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  // Prefer blocked first (needs attention), then executing, then pending
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
    const res  = await fetch(url, { method: "POST", headers, body: JSON.stringify({ action, ...payload }) });
    return res.json();
  } catch (e: any) {
    return { error: e?.message || "fetch failed" };
  }
}

/* ═══════════════════════════════════════════════════════════
   Handoff document generator (Fresh Chat modal)
═══════════════════════════════════════════════════════════ */

function generateHandoff(messages: BridgeMsg[], modMap: Record<number, BridgeMsg[]>): string {
  const now  = new Date().toISOString();
  const done  = MODULES.filter(m => deriveModuleStatus(modMap[m.num] || []) === "done").length;
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
    lines.push(`${cfg.icon} MODULE ${String(mod.num).padStart(2,"0")} — ${mod.name} [${cfg.label}]`);
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
      `## Active Task`,
      ``,
      `Module: ${active.metadata?.module_num ?? "?"} · Task: ${active.metadata?.task ?? "?"}`,
      active.body?.slice(0, 400) || "(no body)",
      ``,
    );
  }
  lines.push(
    `## Pending Modules`,
    ``,
    ...MODULES
      .filter(m => deriveModuleStatus(modMap[m.num] || []) === "pending")
      .map(m => `• MODULE ${String(m.num).padStart(2,"0")} — ${m.name}`),
    ``,
    `---`,
    `Paste this into a new Claude Chat session to continue the build.`,
  );
  return lines.join("\n");
}

/* ═══════════════════════════════════════════════════════════
   Sub-components
═══════════════════════════════════════════════════════════ */

/** Status badge chip */
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

const STATUS_BADGE_CFG: Record<string, { color: string; bg: string; label: string }> = {
  pending:   { color: C.yellow, bg: "rgba(234,179,8,0.12)",   label: "pending"   },
  executing: { color: C.blue,   bg: "rgba(59,130,246,0.12)",  label: "executing" },
  done:      { color: C.green,  bg: "rgba(34,197,94,0.12)",   label: "done"      },
  blocked:   { color: C.red,    bg: "rgba(239,68,68,0.12)",   label: "blocked"   },
  paused:    { color: C.orange, bg: "rgba(249,115,22,0.12)",  label: "paused"    },
  info:      { color: C.muted,  bg: "rgba(107,107,128,0.12)", label: "info"      },
};

/** One row in the module checklist */
function ModuleRow({
  mod, msgs, expanded, onToggle,
}: {
  mod:      typeof MODULES[0];
  msgs:     BridgeMsg[];
  expanded: boolean;
  onToggle: () => void;
}) {
  const status = deriveModuleStatus(msgs);
  const cfg    = MOD_STATUS_CFG[status];
  const latest = msgs[0] || null;
  const tasks  = extractModuleTasks(msgs);
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
      {/* Row header */}
      <button
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/[0.02] transition-colors"
        onClick={onToggle}
      >
        {/* Status icon */}
        <span
          className="text-sm flex-shrink-0"
          style={{
            filter: isBuilding ? "drop-shadow(0 0 4px #3b82f6)" : undefined,
            animation: isBuilding ? "pulse 1.5s ease-in-out infinite" : undefined,
          }}
        >
          {cfg.icon}
        </span>

        <div className="flex-1 min-w-0">
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
          <div className="text-xs font-medium truncate" style={{ color: C.text }}>
            {mod.name}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {latest && (
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

      {/* Expanded tasks + latest message */}
      {expanded && (
        <div
          className="px-3 pb-3 border-t"
          style={{ borderColor: `${cfg.color}20` }}
        >
          {/* Tasks */}
          {tasks.length > 0 && (
            <div className="mt-2 mb-3">
              <div className="text-[9px] font-mono uppercase mb-1.5" style={{ color: C.muted }}>
                Tasks
              </div>
              <div className="flex flex-col gap-1">
                {tasks.map(t => {
                  const tc = MOD_STATUS_CFG[t.status];
                  return (
                    <div key={t.name} className="flex items-center gap-2">
                      <span className="text-xs flex-shrink-0">{tc.icon}</span>
                      <span className="text-[10px] font-mono truncate flex-1" style={{ color: C.text }}>
                        {t.name}
                      </span>
                      <span className="text-[9px] font-mono" style={{ color: tc.color }}>
                        {tc.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Latest message preview */}
          {latest && (
            <div
              className="rounded p-2"
              style={{ background: "rgba(255,255,255,0.02)", border: `1px solid ${C.border}` }}
            >
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
                    {latest.metadata.sha}
                    {latest.metadata.branch ? ` (${latest.metadata.branch})` : ""}
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

/** Active task card */
function ActiveTaskCard({ msg }: { msg: BridgeMsg | null }) {
  const [expanded, setExpanded] = useState(false);

  if (!msg) {
    return (
      <div
        className="rounded-xl border p-6 flex flex-col items-center justify-center"
        style={{ borderColor: C.border, background: C.card, minHeight: 120 }}
      >
        <Clock size={20} style={{ color: C.muted, marginBottom: 8 }} />
        <p className="text-sm font-mono" style={{ color: C.muted }}>
          ⏳ Waiting for next instruction…
        </p>
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
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
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
              <span
                className="text-[10px] font-mono font-bold px-2 py-0.5 rounded"
                style={{ color: C.cyan, background: `${C.cyan}18`, border: `1px solid ${C.cyan}40` }}
              >
                CLAUDE CODE
              </span>
            </>
          )}
        </div>
        <span className="text-[10px] font-mono" style={{ color: C.muted }}>
          {fmtRelative(msg.created_at)}
        </span>
      </div>

      {/* Module · Task */}
      {(meta.module_num || meta.task) && (
        <div className="text-[10px] font-mono mb-2" style={{ color: C.muted }}>
          {meta.module_num && `Module ${String(meta.module_num).padStart(2, "0")}`}
          {meta.task && ` · ${meta.task}`}
        </div>
      )}

      <div className="border-b mb-3" style={{ borderColor: C.border }} />

      {/* Title */}
      {msg.title && (
        <p className="text-sm font-semibold mb-2" style={{ color: C.text }}>{msg.title}</p>
      )}

      {/* Body */}
      <p className="text-xs font-mono leading-relaxed mb-3" style={{ color: "#a0a0b0" }}>
        {expanded ? msg.body : preview}
        {!expanded && (msg.body?.length || 0) > 300 && (
          <button
            className="ml-1 hover:underline"
            style={{ color: C.blue }}
            onClick={() => setExpanded(true)}
          >
            View full ↓
          </button>
        )}
        {expanded && (
          <button
            className="ml-1 hover:underline"
            style={{ color: C.blue }}
            onClick={() => setExpanded(false)}
          >
            {" "}Collapse ↑
          </button>
        )}
      </p>

      {/* Footer: status + meta */}
      <div className="flex items-center gap-3 flex-wrap">
        {meta.status && <StatusBadge status={meta.status} />}
        {meta.sha && (
          <span className="flex items-center gap-1 text-[9px] font-mono" style={{ color: C.muted }}>
            <GitCommit size={8} /> {meta.sha}
          </span>
        )}
        {meta.ts_status && (
          <span
            className="flex items-center gap-1 text-[9px] font-mono"
            style={{ color: meta.ts_status === "clean" ? C.green : C.red }}
          >
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

/** Compact feed entry row */
function FeedEntry({ msg }: { msg: BridgeMsg }) {
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
        borderColor: expanded ? `${whoC.color}30` : C.border,
        background:  expanded ? `${whoC.color}05` : "rgba(18,18,26,0.5)",
      }}
    >
      <button
        className="w-full flex items-start gap-2 px-3 py-2 text-left hover:bg-white/[0.015] transition-colors"
        onClick={() => setExpanded(v => !v)}
      >
        {/* WHO badge */}
        <span
          className="inline-flex px-1.5 py-0.5 rounded text-[8px] font-mono font-bold flex-shrink-0 mt-0.5"
          style={{ color: whoC.color, background: `${whoC.color}18`, border: `1px solid ${whoC.color}30` }}
        >
          {msg.created_by === "claude_chat" ? "CHAT" : msg.created_by === "claude_code" ? "CODE" : "SYS"}
        </span>

        {/* Kind badge */}
        <span
          className="inline-flex px-1.5 py-0.5 rounded text-[8px] font-mono flex-shrink-0 mt-0.5"
          style={{ color: kindC.color, background: `${kindC.color}18`, border: `1px solid ${kindC.color}25` }}
        >
          {kindC.label}
        </span>

        {/* Module·Task */}
        {meta.module_num && (
          <span className="text-[9px] font-mono flex-shrink-0 mt-0.5" style={{ color: C.muted }}>
            M{String(meta.module_num).padStart(2, "0")}
            {meta.task ? `·${meta.task}` : ""}
          </span>
        )}

        {/* Content preview */}
        <div className="flex-1 min-w-0">
          {msg.title && (
            <p className="text-[10px] font-semibold truncate" style={{ color: C.text }}>{msg.title}</p>
          )}
          {!expanded && (
            <p className="text-[10px] font-mono truncate" style={{ color: C.muted }}>{preview}</p>
          )}
        </div>

        {/* Status + time */}
        <div className="flex items-center gap-1.5 flex-shrink-0 mt-0.5">
          {meta.status && <StatusBadge status={meta.status} />}
          <span className="text-[9px] font-mono" style={{ color: C.muted }}>
            {fmtRelative(msg.created_at)}
          </span>
          {expanded
            ? <ChevronUp  size={10} style={{ color: C.muted }} />
            : <ChevronDown size={10} style={{ color: C.muted }} />
          }
        </div>
      </button>

      {/* Expanded */}
      {expanded && (
        <div className="px-3 pb-3 border-t" style={{ borderColor: C.border }}>
          <pre
            className="text-[10px] font-mono leading-relaxed whitespace-pre-wrap break-words mt-2 max-h-72 overflow-y-auto"
            style={{ color: "#a0a0b0", scrollbarWidth: "thin" }}
          >
            {msg.body}
          </pre>
          <div className="flex items-center gap-3 flex-wrap mt-2">
            <span className="text-[9px] font-mono" style={{ color: C.muted }}>
              {fmtTime(msg.created_at)}
            </span>
            {meta.sha && (
              <span className="flex items-center gap-1 text-[9px] font-mono" style={{ color: C.muted }}>
                <GitCommit size={7} /> {meta.sha}{meta.branch ? ` (${meta.branch})` : ""}
              </span>
            )}
            {meta.ts_status && (
              <span
                className="flex items-center gap-1 text-[9px] font-mono"
                style={{ color: meta.ts_status === "clean" ? C.green : C.red }}
              >
                <Code2 size={7} /> TS: {meta.ts_status}
              </span>
            )}
            {meta.tokens_estimated && (
              <span className="text-[9px] font-mono" style={{ color: C.muted }}>
                ~{fmtTokens(meta.tokens_estimated)} tok
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Bottom health + usage strip */
function BottomStrip({
  usage, cost, health, messages,
}: {
  usage:    UsageStats | null;
  cost:     CostData | null;
  health:   HealthState;
  messages: BridgeMsg[];
}) {
  // Derive conversation length from latest claude_chat message
  const convWords = (() => {
    const sorted = [...messages].sort((a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    const cc = sorted.find(m => m.created_by === "claude_chat" && m.metadata?.conversation_length);
    return cc ? Number(cc.metadata.conversation_length) : null;
  })();

  const CONTEXT_MAX = 100_000;
  const ctxPct = convWords !== null ? Math.min(100, Math.round((convWords / CONTEXT_MAX) * 100)) : null;
  const ctxColor = ctxPct === null ? C.muted
    : ctxPct >= 90 ? C.red
    : ctxPct >= 70 ? C.yellow
    : C.green;
  const ctxLabel = ctxPct === null ? "unknown"
    : ctxPct >= 90 ? "⚠ START FRESH CHAT"
    : ctxPct >= 70 ? "Consider fresh chat"
    : "OK";

  const tokenPct = usage ? Math.min(100, Math.round((usage.tokens_today / SESSION_TOKEN_BUDGET) * 100)) : 0;
  const tokenColor = tokenPct >= 90 ? C.red : tokenPct >= 70 ? C.yellow : C.green;

  const tile = "rounded-xl border p-3 flex flex-col gap-2";
  const tileStyle = { borderColor: C.border, background: C.card };

  const healthItems = [
    { label: "TS",    ok: health.ts !== "errors",  val: health.ts    === "clean" ? "✅ CLEAN" : health.ts    === "errors" ? "❌ ERRORS" : "— unknown" },
    { label: "Git",   ok: health.git !== "stale",  val: health.git   === "synced" ? "✅ SYNC"  : health.git  === "stale"  ? "⚠ STALE"  : "— unknown" },
    { label: "DB",    ok: health.db !== "error",   val: health.db    === "ok"    ? "✅ OK"    : health.db   === "error"  ? "❌ ERROR"  : "— unknown" },
    { label: "Build", ok: health.build !== "stale", val: health.build === "ok"   ? "✅ OK"    : health.build === "stale" ? "⚠ STALE"  : "— unknown" },
  ];

  return (
    <div className="flex gap-3">
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
              <span className="text-[10px] font-mono" style={{ color: ctxColor }}>
                {ctxPct}% used
              </span>
              <span className="text-[10px] font-mono" style={{ color: ctxColor }}>
                {ctxLabel}
              </span>
            </div>
            {ctxPct >= 90 && (
              <div
                className="text-[9px] font-mono px-2 py-1 rounded"
                style={{ color: C.red, background: `${C.red}15`, border: `1px solid ${C.red}30` }}
              >
                Start fresh chat — paste handoff
              </div>
            )}
          </>
        ) : (
          <span className="text-[10px] font-mono" style={{ color: C.muted }}>
            No conversation_length in bridge yet
          </span>
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
            <span className="text-[10px] font-mono font-bold" style={{ color: C.green }}>
              {usage?.completed_today ?? "—"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-[10px] font-mono" style={{ color: C.muted }}>Tokens</span>
            <span className="text-[10px] font-mono font-bold" style={{ color: C.blue }}>
              {usage ? `~${fmtTokens(usage.tokens_today)}` : "—"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-[10px] font-mono" style={{ color: C.muted }}>Est. cost</span>
            <span className="text-[10px] font-mono font-bold" style={{ color: tokenColor }}>
              {usage ? `~$${usage.cost_today_usd.toFixed(4)}` : "—"}
            </span>
          </div>
          <Progress value={tokenPct} className="h-1 mt-1" style={{ background: "rgba(255,255,255,0.06)" }} />
        </div>
      </div>

      {/* THIS MONTH */}
      <div className={tile} style={{ ...tileStyle, flex: 1 }}>
        <div className="flex items-center gap-2">
          <DollarSign size={11} style={{ color: C.orange }} />
          <span className="text-[9px] font-mono uppercase tracking-wider" style={{ color: C.muted }}>This Month</span>
        </div>
        <div className="flex flex-col gap-1">
          <div className="flex justify-between">
            <span className="text-[10px] font-mono" style={{ color: C.muted }}>API cost</span>
            <span className="text-[10px] font-mono font-bold" style={{ color: C.orange }}>
              {cost?.month_usd != null ? `$${cost.month_usd.toFixed(2)}`
                : usage?.month_cost_usd != null ? `$${usage.month_cost_usd.toFixed(2)}` : "—"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-[10px] font-mono" style={{ color: C.muted }}>Tasks</span>
            <span className="text-[10px] font-mono font-bold" style={{ color: C.text }}>
              {cost?.month_tasks ?? usage?.total_messages ?? "—"}
            </span>
          </div>
          <div className="flex items-center gap-1 mt-0.5">
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: C.green, boxShadow: `0 0 4px ${C.green}` }}
            />
            <span className="text-[9px] font-mono" style={{ color: C.muted }}>Normal</span>
          </div>
        </div>
      </div>

      {/* HEALTH */}
      <div className={tile} style={{ ...tileStyle, flex: 1 }}>
        <div className="flex items-center gap-2">
          <Activity size={11} style={{ color: C.green }} />
          <span className="text-[9px] font-mono uppercase tracking-wider" style={{ color: C.muted }}>Health</span>
        </div>
        <div className="flex flex-col gap-1">
          {healthItems.map(h => (
            <div key={h.label} className="flex justify-between">
              <span className="text-[10px] font-mono" style={{ color: C.muted }}>{h.label}:</span>
              <span className="text-[10px] font-mono" style={{ color: h.ok ? C.green : C.red }}>
                {h.val}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Fresh Chat modal */
function FreshChatModal({
  content, onClose,
}: { content: string; onClose: () => void }) {
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
        <button
          className="absolute top-4 right-4"
          style={{ color: C.muted }}
          onClick={onClose}
        >
          <X size={16} />
        </button>
        <div>
          <h2 className="text-sm font-bold mb-1" style={{ color: C.purple }}>🔄 FRESH CHAT HANDOFF</h2>
          <p className="text-[11px] font-mono" style={{ color: C.muted }}>
            Copy this into a new Claude Chat session to continue the build.
          </p>
        </div>
        <div
          className="flex-1 overflow-y-auto rounded p-3"
          style={{ background: "#0a0a0f", border: `1px solid ${C.border}`, scrollbarWidth: "thin" }}
        >
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

/* ═══════════════════════════════════════════════════════════
   Main Page
═══════════════════════════════════════════════════════════ */

export default function Build() {
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

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cdRef       = useRef<ReturnType<typeof setInterval> | null>(null);

  /* ── Derived data ── */
  const moduleMap   = buildModuleMap(messages);
  const doneCount   = MODULES.filter(m => deriveModuleStatus(moduleMap[m.num] || []) === "done").length;
  const sorted      = [...messages].sort((a, b) =>
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  const activeTask  = findActiveTask(messages);
  const progressPct = Math.round((doneCount / 12) * 100);

  // Context bar — for Fresh Chat button visibility
  const ctxWords = (() => {
    const cc = sorted.find(m => m.created_by === "claude_chat" && m.metadata?.conversation_length);
    return cc ? Number(cc.metadata.conversation_length) : null;
  })();
  const ctxPct = ctxWords !== null ? Math.min(100, Math.round((ctxWords / 100_000) * 100)) : 0;

  /* ── Fetch bridge messages + usage ── */
  const fetchBridge = useCallback(async () => {
    if (!BRIDGE_TOKEN) {
      setError("VITE_BRIDGE_READ_TOKEN not set in .env");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [listR, usageR] = await Promise.all([
        bridgeCall("list",  { limit: 200 }),
        bridgeCall("usage", {}),
      ]);
      if (listR.ok) {
        setMessages(listR.messages || []);
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
    }
  }, []);

  /* ── Fetch Supabase cost data ── */
  const fetchCosts = useCallback(async () => {
    try {
      const todayStart  = new Date(); todayStart.setHours(0,0,0,0);
      const monthStart  = new Date(); monthStart.setDate(1); monthStart.setHours(0,0,0,0);

      const [todayR, monthR] = await Promise.allSettled([
        supabase.from("api_cost_log").select("cost_usd").gte("created_at", todayStart.toISOString()),
        supabase.from("api_cost_log").select("cost_usd, created_at").gte("created_at", monthStart.toISOString()),
      ]);

      const todayRows  = todayR.status  === "fulfilled" ? (todayR.value.data  || []) : [];
      const monthRows  = monthR.status  === "fulfilled" ? (monthR.value.data  || []) : [];
      const today_usd  = todayRows.reduce((s: number, r: any) => s + (Number(r.cost_usd) || 0), 0);
      const month_usd  = monthRows.reduce((s: number, r: any) => s + (Number(r.cost_usd) || 0), 0);

      setCost({
        today_usd:   Number(today_usd.toFixed(4)),
        month_usd:   Number(month_usd.toFixed(2)),
        month_tasks: monthRows.length,
      });
    } catch { /* table may not exist */ }
  }, []);

  /* ── Health checks ── */
  const fetchHealth = useCallback(async (msgs: BridgeMsg[]) => {
    const allSorted = [...msgs].sort((a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    // TS from bridge metadata
    const tsMsg = allSorted.find(m => m.metadata?.ts_status);
    const tsStatus: HealthState["ts"] = tsMsg
      ? (tsMsg.metadata.ts_status === "clean" ? "clean" : "errors")
      : "unknown";

    // Git: check if any message has sha + was recent (within 2h)
    const gitMsg = allSorted.find(m => m.metadata?.sha);
    let gitStatus: HealthState["git"] = "unknown";
    if (gitMsg) {
      const age = Date.now() - new Date(gitMsg.created_at).getTime();
      gitStatus = age < 2 * 3600 * 1000 ? "synced" : "stale";
    }

    // DB: quick supabase ping
    let dbStatus: HealthState["db"] = "unknown";
    try {
      const { error } = await supabase.from("claude_bridge").select("id").limit(1);
      dbStatus = error ? "error" : "ok";
    } catch { dbStatus = "error"; }

    // Build: most recent message age
    const buildStatus: HealthState["build"] = allSorted[0]
      ? (Date.now() - new Date(allSorted[0].created_at).getTime() < 6 * 3600 * 1000 ? "ok" : "stale")
      : "unknown";

    setHealth({
      ts:     tsStatus,
      git:    gitStatus,
      db:     dbStatus,
      build:  buildStatus,
      ts_sha: tsMsg?.metadata?.sha || "",
    });
  }, []);

  /* ── Full refresh ── */
  const fetchAll = useCallback(async () => {
    await fetchBridge();
    await fetchCosts();
  }, [fetchBridge, fetchCosts]);

  /* ── After messages update, run health ── */
  useEffect(() => {
    if (messages.length > 0) {
      fetchHealth(messages);
    }
  }, [messages, fetchHealth]);

  /* ── Auto-refresh ── */
  useEffect(() => {
    fetchAll();
    intervalRef.current = setInterval(fetchAll, 20_000);
    cdRef.current = setInterval(() => setCountdown(c => Math.max(0, c - 1)), 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (cdRef.current)       clearInterval(cdRef.current);
    };
  }, [fetchAll]);

  /* ── Pause / Resume ── */
  const handlePause = useCallback(async () => {
    if (!BRIDGE_SECRET) { alert("VITE_BRIDGE_SECRET not set"); return; }
    setPosting(true);
    try {
      await bridgeCall("post", {
        kind:       "status",
        title:      "PAUSED — King paused the build. Claude Chat: stop sending instructions until RESUMED status posted.",
        body:       "PAUSED — King paused the build. Claude Chat: stop sending instructions until RESUMED status posted.",
        created_by: "claude_code",
        metadata:   { status: "paused", control: true },
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
        kind:       "status",
        title:      "RESUMED — continue build",
        body:       "RESUMED — continue build",
        created_by: "claude_code",
        metadata:   { status: "executing", control: true },
      }, true);
      setIsPaused(false);
      await fetchAll();
    } finally { setPosting(false); }
  }, [fetchAll]);

  /* ── Fresh Chat modal ── */
  const openFreshChat = () => {
    const doc = generateHandoff(messages, moduleMap);
    setHandoffContent(doc);
    setShowFreshChat(true);
  };

  /* ═══════════════════════════════════════════════════════
     RENDER
  ═══════════════════════════════════════════════════════ */

  return (
    <div
      className="min-h-screen flex flex-col font-sans select-none"
      style={{ background: C.bg, color: C.text }}
    >
      {/* ── TOP BAR ── */}
      <div
        className="flex-shrink-0 flex items-center justify-between px-5 py-2.5 border-b z-20"
        style={{
          background:    "rgba(10,10,15,0.95)",
          backdropFilter: "blur(12px)",
          borderColor:   C.border,
          position:      "sticky",
          top:           0,
        }}
      >
        {/* Left: title */}
        <div className="flex items-center gap-3">
          <Crown size={16} style={{ color: "#fbbf24" }} />
          <span className="text-sm font-bold tracking-wider" style={{ color: C.text }}>
            SEO SEASON — EMPIRE BUILD COMMAND
          </span>
          {lastFetch && (
            <span className="text-[10px] font-mono" style={{ color: C.muted }}>
              Last sync: {fmtTime(lastFetch.toISOString())}
            </span>
          )}
        </div>

        {/* Right: controls */}
        <div className="flex items-center gap-2">
          {/* Live indicator */}
          <div className="flex items-center gap-1.5 mr-2">
            <span
              className="w-2 h-2 rounded-full"
              style={{
                background: error ? C.red : C.green,
                boxShadow:  error ? undefined : `0 0 6px ${C.green}`,
                animation:  error ? undefined : "pulse 2s infinite",
              }}
            />
            <span className="text-[10px] font-mono" style={{ color: C.muted }}>
              {error ? "ERROR" : `LIVE · ${countdown}s`}
            </span>
          </div>

          {/* Fresh Chat — only when context ≥ 70% */}
          {ctxPct >= 70 && (
            <Button
              size="sm"
              className="h-7 px-2 text-[10px] font-mono gap-1"
              style={{ background: `${C.purple}20`, color: C.purple, border: `1px solid ${C.purple}40` }}
              onClick={openFreshChat}
            >
              <MessageSquare size={10} /> Fresh Chat
            </Button>
          )}

          {/* Pause / Resume */}
          {isPaused ? (
            <Button
              size="sm"
              disabled={posting}
              className="h-7 px-2 text-[10px] font-mono gap-1"
              style={{ background: `${C.green}20`, color: C.green, border: `1px solid ${C.green}40` }}
              onClick={handleResume}
            >
              {posting ? <Loader2 size={10} className="animate-spin" /> : <Play size={10} />}
              Resume
            </Button>
          ) : (
            <Button
              size="sm"
              disabled={posting}
              className="h-7 px-2 text-[10px] font-mono gap-1"
              style={{
                background: isPaused ? `${C.orange}20` : `${C.orange}15`,
                color:      C.orange,
                border:     `1px solid ${C.orange}40`,
              }}
              onClick={handlePause}
            >
              {posting ? <Loader2 size={10} className="animate-spin" /> : <Pause size={10} />}
              Pause Build
            </Button>
          )}

          {/* Refresh */}
          <Button
            size="sm"
            disabled={loading}
            className="h-7 px-2 text-[10px] font-mono gap-1 border-white/10 text-slate-400 hover:text-slate-200 bg-transparent hover:bg-white/5"
            variant="outline"
            onClick={fetchAll}
          >
            {loading ? <Loader2 size={10} className="animate-spin" /> : <RefreshCw size={10} />}
            Refresh
          </Button>
        </div>
      </div>

      {/* ── PAUSED BANNER ── */}
      {isPaused && (
        <div
          className="flex-shrink-0 px-5 py-2 text-center text-sm font-mono font-bold"
          style={{ background: `${C.orange}20`, color: C.orange, borderBottom: `1px solid ${C.orange}30` }}
        >
          ⏸ BUILD PAUSED — Claude Chat is waiting for RESUME signal
        </div>
      )}

      {/* ── ERROR BANNER ── */}
      {error && (
        <div
          className="flex-shrink-0 mx-5 mt-3 px-3 py-2 rounded-lg text-xs font-mono"
          style={{ background: `${C.red}12`, color: C.red, border: `1px solid ${C.red}30` }}
        >
          ⚠ {error}
        </div>
      )}

      {/* ── MAIN BODY (flex row: left + right) ── */}
      <div className="flex flex-1 gap-0 overflow-hidden" style={{ minHeight: 0 }}>

        {/* ══ LEFT: MODULE CHECKLIST ══ */}
        <div
          className="flex-shrink-0 flex flex-col border-r overflow-hidden"
          style={{ width: 280, borderColor: C.border }}
        >
          {/* Header */}
          <div className="px-4 pt-4 pb-2 flex-shrink-0">
            <div className="text-xs font-bold tracking-wider mb-0.5" style={{ color: C.text }}>
              EMPIRE MODULES
            </div>
            <div className="text-[10px] font-mono" style={{ color: C.muted }}>
              {doneCount}/12 complete
            </div>
            <div className="mt-2">
              <Progress value={progressPct} className="h-1" style={{ background: "rgba(255,255,255,0.06)" }} />
              <div className="text-[9px] font-mono mt-1 text-right" style={{ color: C.muted }}>
                {progressPct}%
              </div>
            </div>
          </div>

          {/* Module list */}
          <div className="flex-1 overflow-y-auto px-3 pb-3 flex flex-col gap-1.5" style={{ scrollbarWidth: "thin" }}>
            {MODULES.map(mod => (
              <ModuleRow
                key={mod.num}
                mod={mod}
                msgs={moduleMap[mod.num] || []}
                expanded={expandedMod === mod.num}
                onToggle={() => setExpandedMod(v => v === mod.num ? null : mod.num)}
              />
            ))}
          </div>

          {/* Progress summary */}
          <div
            className="flex-shrink-0 px-4 py-3 border-t text-center"
            style={{ borderColor: C.border }}
          >
            <div className="text-[10px] font-mono" style={{ color: C.muted }}>
              {[
                { s: "done",     l: "✅", c: C.green  },
                { s: "building", l: "⚡", c: C.blue   },
                { s: "blocked",  l: "🚫", c: C.red    },
                { s: "paused",   l: "⏸",  c: C.orange },
              ].map(({ s, l, c }) => {
                const cnt = MODULES.filter(m => deriveModuleStatus(moduleMap[m.num] || []) === s).length;
                if (!cnt) return null;
                return (
                  <span key={s} className="mr-3" style={{ color: c }}>
                    {l} {cnt}
                  </span>
                );
              })}
            </div>
          </div>
        </div>

        {/* ══ RIGHT: ACTIVE TASK + LIVE FEED ══ */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">

          {/* Active task (top half of right) */}
          <div
            className="flex-shrink-0 px-5 pt-4 pb-3 border-b"
            style={{ borderColor: C.border }}
          >
            <div className="text-[10px] font-mono font-bold uppercase tracking-wider mb-2" style={{ color: C.muted }}>
              Active Right Now
            </div>
            <ActiveTaskCard msg={activeTask} />
          </div>

          {/* Live feed (bottom half of right) */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Feed header */}
            <div
              className="flex-shrink-0 flex items-center gap-2 px-5 pt-3 pb-2"
            >
              <Radio size={11} style={{ color: C.indigo }} />
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider" style={{ color: C.muted }}>
                Build Log
              </span>
              <span
                className="text-[9px] font-mono px-1.5 py-0.5 rounded-full"
                style={{ background: `${C.indigo}20`, color: C.indigo }}
              >
                {sorted.length} messages
              </span>
            </div>

            {/* Feed scroll area */}
            <div className="flex-1 overflow-y-auto px-5 pb-3 flex flex-col gap-1.5" style={{ scrollbarWidth: "thin" }}>
              {sorted.length === 0 && !loading && (
                <div
                  className="rounded-xl border p-8 text-center"
                  style={{ borderColor: C.border, background: C.card }}
                >
                  <Clock size={20} style={{ color: C.muted, margin: "0 auto 8px" }} />
                  <p className="text-sm font-mono" style={{ color: C.muted }}>No messages yet.</p>
                  <p className="text-[10px] font-mono mt-1" style={{ color: "#3b3b52" }}>
                    Post via: npx tsx scripts/bridge.ts dump
                  </p>
                </div>
              )}
              {sorted.map(msg => (
                <FeedEntry key={msg.id} msg={msg} />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── BOTTOM STRIP ── */}
      <div
        className="flex-shrink-0 px-5 py-3 border-t"
        style={{ borderColor: C.border, background: "rgba(10,10,15,0.8)" }}
      >
        <BottomStrip
          usage={usage}
          cost={cost}
          health={health}
          messages={messages}
        />
      </div>

      {/* ── Fresh Chat Modal ── */}
      {showFreshChat && (
        <FreshChatModal
          content={handoffContent}
          onClose={() => setShowFreshChat(false)}
        />
      )}
    </div>
  );
}
