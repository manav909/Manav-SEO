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
  thinking:    { color: C.blue,    label: "thinking"    },
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

/**
 * Derive module status from its bridge messages (newest first).
 *
 * DONE requires an EXPLICIT signal — never inferred from fuzzy body text:
 *   • meta.module_done === true
 *   • body or title contains MODULE_NN_DONE (case-insensitive)
 *
 * Everything else uses the latest message's kind + metadata.status only.
 */
function deriveModuleStatus(msgs: BridgeMsg[]): ModStatus {
  if (!msgs.length) return "pending";

  // ── Pass 1: scan ALL messages for an explicit done marker ──
  for (const m of msgs) {
    const meta  = m.metadata || {};
    if (meta.module_done === true) return "done";
    if (/MODULE_\d+_DONE/i.test(m.body  || "")) return "done";
    if (/MODULE_\d+_DONE/i.test(m.title || "")) return "done";
  }

  // ── Pass 2: derive current phase from the LATEST message ──
  const latest = msgs[0];
  const meta   = latest.metadata || {};
  const status = (meta.status as string) || "";
  const kind   = latest.kind;
  const body   = (latest.body || "").toLowerCase();

  // Explicit halt states take priority
  if (status === "blocked") return "blocked";
  if (status === "paused")  return "paused";

  // Active instruction → building
  if (kind === "instruction" && (status === "pending" || status === "executing" || !status)) return "building";

  // Response marked done → entered test phase (requires explicit DONE marker to advance to done)
  if (kind === "response" && (status === "done" || meta.tsc_clean || meta.ts_status === "clean")) return "testing";

  // Status messages: only derive halt states — never derive DONE from body text
  if (kind === "status") {
    if (body.includes("paused"))                              return "paused";
    if (body.includes("blocked"))                             return "blocked";
    if (body.includes("resumed") || body.includes("building")) return "building";
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

interface ActivityLine {
  id:    string;
  icon:  string;
  color: string;
  text:  string;
  time:  string;
}

function deriveActivityLines(messages: BridgeMsg[]): ActivityLine[] {
  const lines: ActivityLine[] = [];
  const sorted = [...messages].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  for (const m of sorted) {
    const meta  = m.metadata || {};
    const title = m.title    || "";
    const body  = m.body     || "";
    const kind  = m.kind;

    if (kind === "thinking") {
      const t = body || title;
      lines.push({
        id:    m.id + ":thinking",
        icon:  "→",
        color: C.blue,
        text:  "Starting: " + t.slice(0, 60) + (t.length > 60 ? "…" : ""),
        time:  m.created_at,
      });
    } else if (kind === "dump") {
      lines.push({
        id:    m.id + ":dump",
        icon:  "⚙",
        color: C.gray,
        text:  "System snapshot posted",
        time:  m.created_at,
      });
    } else if (kind === "response") {
      if (meta.tsc_clean || meta.ts_status === "clean") {
        lines.push({
          id:    m.id + ":ts",
          icon:  "✓",
          color: C.green,
          text:  "TypeScript: clean",
          time:  m.created_at,
        });
      }
      if (meta.sha) {
        lines.push({
          id:    m.id + ":commit",
          icon:  "✓",
          color: C.green,
          text:  `Committed: ${meta.sha}${meta.branch ? ` (${meta.branch})` : ""}`,
          time:  m.created_at,
        });
      }
      if (!meta.tsc_clean && !meta.ts_status && !meta.sha && meta.status === "done") {
        const t = title || body.slice(0, 60);
        lines.push({
          id:    m.id + ":response",
          icon:  "✓",
          color: C.green,
          text:  t.slice(0, 60) + (t.length > 60 ? "…" : ""),
          time:  m.created_at,
        });
      }
    } else if (kind === "status") {
      if (meta.status === "blocked") {
        const t = title || body;
        lines.push({
          id:    m.id + ":blocked",
          icon:  "!",
          color: C.yellow,
          text:  "Blocked: " + t.slice(0, 55) + (t.length > 55 ? "…" : ""),
          time:  m.created_at,
        });
      } else if (meta.task && meta.status === "done") {
        lines.push({
          id:    m.id + ":task-done",
          icon:  "✓",
          color: C.green,
          text:  `${meta.task} complete`,
          time:  m.created_at,
        });
      } else if (meta.module_done) {
        const t = title.slice(0, 60);
        lines.push({
          id:    m.id + ":module-done",
          icon:  "✓",
          color: C.green,
          text:  t || "Module complete",
          time:  m.created_at,
        });
      }
    } else if (kind === "instruction") {
      const t = title || body.slice(0, 60);
      lines.push({
        id:    m.id + ":instruction",
        icon:  "→",
        color: C.indigo,
        text:  t.slice(0, 60) + (t.length > 60 ? "…" : ""),
        time:  m.created_at,
      });
    }

    if (lines.length >= 12) break;
  }

  return lines;
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

/* ── Module Status Icon (40×40, per-status premium styling) ── */
function ModStatusIcon({ status, compact = false }: { status: ModStatus; compact?: boolean }) {
  const sz  = compact ? 32 : 40;
  const r   = compact ? 8  : 10;
  const fsz = compact ? 14 : 18;

  const cfg: Record<ModStatus, { bg: string; border: string; shadow?: string; anim?: string; icon: React.ReactNode }> = {
    pending:  { bg: "#0d0d1a", border: "1.5px solid #2a2a3a", icon: null },
    building: {
      bg: "#0d1830", border: "1.5px solid #3b82f6",
      shadow: "0 0 12px rgba(59,130,246,0.3)", anim: "pulseBlue 2s ease-in-out infinite",
      icon: <span style={{ fontSize: fsz }}>⚡</span>,
    },
    testing:  {
      bg: "#1a1400", border: "1.5px solid #eab308",
      shadow: "0 0 12px rgba(234,179,8,0.2)",
      icon: <span style={{ fontSize: fsz }}>🔬</span>,
    },
    done:     {
      bg: "#051008", border: "1.5px solid #10b981",
      shadow: "0 0 16px rgba(16,185,129,0.25)",
      icon: <span style={{ fontSize: compact ? 16 : 20, fontWeight: 700, color: "#10b981", lineHeight: 1 }}>✓</span>,
    },
    blocked:  {
      bg: "#1a0505", border: "1.5px solid #ef4444",
      anim: "pulseRed 2s ease-in-out infinite",
      icon: <span style={{ fontSize: fsz, color: "#ef4444" }}>✗</span>,
    },
    paused:   {
      bg: "#1a0e00", border: "1.5px solid #f97316",
      icon: <span style={{ fontSize: fsz, color: "#f97316" }}>⏸</span>,
    },
  };

  const c = cfg[status];
  return (
    <div style={{
      width: sz, height: sz, borderRadius: r, flexShrink: 0,
      background: c.bg, border: c.border, boxShadow: c.shadow,
      display: "flex", alignItems: "center", justifyContent: "center",
      animation: c.anim,
      transition: "box-shadow 0.3s",
    }}>
      {c.icon}
    </div>
  );
}

/* ── Module Status Pill badge ── */
function ModStatusPill({ status }: { status: ModStatus }) {
  const cfg: Record<ModStatus, { bg: string; color: string; border: string }> = {
    pending:  { bg: "#0d0d1a", color: "#4b4b6a", border: "0.5px solid #2a2a3a" },
    building: { bg: "#0d1830", color: "#3b82f6", border: "0.5px solid #3b82f6" },
    testing:  { bg: "#1a1400", color: "#eab308", border: "0.5px solid #eab308" },
    done:     { bg: "#0a2010", color: "#10b981", border: "0.5px solid #10b981" },
    blocked:  { bg: "#1a0505", color: "#ef4444", border: "0.5px solid #ef4444" },
    paused:   { bg: "#1a0e00", color: "#f97316", border: "0.5px solid #f97316" },
  };
  const labels: Record<ModStatus, string> = {
    pending: "PENDING", building: "BUILDING", testing: "TESTING",
    done: "DONE", blocked: "BLOCKED", paused: "PAUSED",
  };
  const c = cfg[status];
  return (
    <span style={{
      display: "inline-flex", alignItems: "center",
      fontSize: 9, fontFamily: "monospace", fontWeight: 600, letterSpacing: "0.08em",
      padding: "2px 8px", borderRadius: 20,
      background: c.bg, color: c.color, border: c.border,
    }}>
      {labels[status]}
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
  const status  = deriveModuleStatus(msgs);
  const latest  = msgs[0] || null;
  const tasks   = extractModuleTasks(msgs);

  const leftBorderColor: Record<ModStatus, string> = {
    done:     "#10b981", building: "#3b82f6", testing:  "#eab308",
    blocked:  "#ef4444", paused:   "#f97316", pending:  "transparent",
  };
  const cardBg: Record<ModStatus, string> = {
    done:     "linear-gradient(to right, rgba(16,185,129,0.05), transparent)",
    building: "linear-gradient(to right, rgba(59,130,246,0.05), transparent)",
    testing:  "linear-gradient(to right, rgba(234,179,8,0.04), transparent)",
    blocked:  "linear-gradient(to right, rgba(239,68,68,0.05), transparent)",
    paused:   "linear-gradient(to right, rgba(249,115,22,0.04), transparent)",
    pending:  "#0d0d1a",
  };
  const outerBorder: Record<ModStatus, string> = {
    done:     "rgba(16,185,129,0.2)", building: "rgba(59,130,246,0.2)",
    testing:  "rgba(234,179,8,0.2)",  blocked:  "rgba(239,68,68,0.3)",
    paused:   "rgba(249,115,22,0.2)", pending:  "#1e1e2e",
  };

  return (
    <div
      style={{
        borderRadius: 12,
        border:       `1px solid ${outerBorder[status]}`,
        borderLeft:   `3px solid ${leftBorderColor[status]}`,
        background:   cardBg[status],
        overflow:     "hidden",
        boxShadow:    status === "blocked"  ? "0 0 16px rgba(239,68,68,0.1)"
                    : status === "building" ? "0 0 16px rgba(59,130,246,0.08)"
                    : undefined,
        transition:   "box-shadow 0.3s",
      }}
    >
      {/* ── Header button ── */}
      <button
        className="w-full text-left transition-colors hover:bg-white/[0.025]"
        style={{ padding: compact ? "10px 14px" : "14px 16px" }}
        onClick={onToggle}
      >
        <div style={{ display: "flex", alignItems: "center", gap: compact ? 12 : 16 }}>
          <ModStatusIcon status={status} compact={compact} />

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
              <span style={{ fontSize: 10, letterSpacing: "1.5px", textTransform: "uppercase", color: "#4b4b6a", fontFamily: "monospace" }}>
                MODULE {String(mod.num).padStart(2, "0")}
              </span>
              {latest && (
                <span style={{ fontSize: 11, color: "#4b4b6a", flexShrink: 0 }}>
                  {fmtRelative(latest.created_at)}
                </span>
              )}
            </div>
            <div style={{ fontSize: compact ? 13 : 15, fontWeight: 600, color: "#f0f0ff", marginTop: 3, lineHeight: 1.25 }}>
              {mod.name}
            </div>
            <div style={{ marginTop: 6 }}>
              <ModStatusPill status={status} />
            </div>
          </div>

          {/* Animated chevron */}
          <div style={{
            transform:  expanded ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 220ms ease",
            color:      "#4b4b6a",
            flexShrink: 0,
          }}>
            <ChevronDown size={18} />
          </div>
        </div>
      </button>

      {/* ── Expanded detail ── */}
      {expanded && (
        <div style={{ background: "#090912", borderTop: "1px solid #1e1e3a", padding: "12px 16px 14px 68px" }}>
          {tasks.length > 0 ? (
            <div>
              {tasks.map((t, i) => {
                const tc = MOD_STATUS_CFG[t.status];
                return (
                  <div key={t.name}>
                    {i > 0 && <div style={{ borderTop: "1px dashed #1e1e3a", margin: "8px 0" }} />}
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: tc.color, flexShrink: 0 }} />
                      <span style={{ fontSize: 10, fontFamily: "monospace", color: "#6060a0", letterSpacing: "0.05em" }}>
                        TASK {t.name}
                      </span>
                      <ModStatusPill status={t.status} />
                      {t.latest && (
                        <span style={{ fontSize: 9, color: "#4b4b6a", marginLeft: "auto" }}>
                          {fmtRelative(t.latest.created_at)}
                        </span>
                      )}
                    </div>
                    {t.latest && (t.latest.title || t.latest.body) && (
                      <p style={{ fontSize: 10, fontFamily: "monospace", color: "#6868a0", marginTop: 3, lineHeight: 1.4 }}>
                        {(t.latest.title || t.latest.body || "").slice(0, 80)}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <p style={{ fontSize: 13, color: "#4b4b6a", fontStyle: "italic" }}>
              Tasks load as Claude Code begins this module
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** Animates trailing dots: "." → ".." → "..." → repeat, 500ms each */
function useDotsAnimation(active: boolean): string {
  const [dots, setDots] = useState(1);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setDots(d => (d === 3 ? 1 : d + 1)), 500);
    return () => clearInterval(id);
  }, [active]);
  return ".".repeat(dots);
}

/** Branded "👑 Manav …" pill badge */
function ManavBadge({ variant }: { variant: "coding" | "blocked" | "delivered" | "ready" }) {
  const dots = useDotsAnimation(variant === "coding");

  const cfg = {
    coding:    { text: `👑 Manav Coding${dots}`, border: "#6366f1", color: "#818cf8" },
    blocked:   { text: "👑 Manav Needs You",      border: "#ef4444", color: "#ef4444" },
    delivered: { text: "👑 Manav Delivered",       border: "#10b981", color: "#10b981" },
    ready:     { text: "👑 Manav Ready",           border: "#374151", color: "#6b7280" },
  }[variant];

  return (
    <span
      style={{
        display:         "inline-flex",
        alignItems:      "center",
        background:      "linear-gradient(135deg, #1a1040 0%, #0d0820 100%)",
        border:          `0.5px solid ${cfg.border}`,
        color:           cfg.color,
        fontSize:        12,
        fontWeight:      500,
        borderRadius:    20,
        padding:         "4px 14px",
        letterSpacing:   "0.01em",
        whiteSpace:      "nowrap",
        transition:      "color 0.3s, border-color 0.3s",
      }}
    >
      {cfg.text}
    </span>
  );
}

/** Elapsed timer — ticks every second from a start ISO timestamp */
function useElapsed(startIso: string | null): string {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!startIso) return;
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [startIso]);
  if (!startIso) return "";
  const s = Math.floor((Date.now() - new Date(startIso).getTime()) / 1000);
  if (s < 60)    return `${s}s`;
  if (s < 3600)  return `${Math.floor(s / 60)}m ${s % 60}s`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

function ActiveTaskCard({
  messages,
}: {
  messages: BridgeMsg[];
}) {
  const sorted = [...messages].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  // Priority 1 — latest thinking message
  const thinking = sorted.find(m => m.kind === "thinking");
  // Priority 2 — latest instruction
  const instruction = sorted.find(m => m.kind === "instruction");
  // Blocked signal — check most recent non-done message
  const blocked = sorted.find(m => m.metadata?.status === "blocked");
  // Last completed — for standing-by state
  const lastDone = sorted.find(
    m => m.metadata?.status === "done" || /MODULE_\d+_DONE/i.test(m.title || "") || m.metadata?.module_done
  );

  const primary = thinking || instruction || null;
  const isBlocked = !!blocked && !thinking;
  const elapsed = useElapsed(primary?.created_at || null);

  /* ── STANDING BY — nothing active ── */
  if (!primary) {
    return (
      <div
        className="rounded-xl border p-6 flex flex-col gap-3"
        style={{ borderColor: C.border, background: C.card, minHeight: 140 }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock size={14} style={{ color: C.muted }} />
            <span className="text-[10px] font-mono font-bold tracking-widest uppercase" style={{ color: C.muted }}>
              ⏳ STANDING BY
            </span>
          </div>
          <ManavBadge variant="ready" />
        </div>
        <p className="text-sm leading-relaxed" style={{ color: "#8080a0" }}>
          Empire is ready. Claude Chat will post the next instruction.
        </p>
        {lastDone && (
          <div className="border-t pt-3 flex flex-col gap-0.5" style={{ borderColor: C.border }}>
            <span className="text-[9px] font-mono uppercase tracking-wider" style={{ color: C.muted }}>Last completed</span>
            <span className="text-[11px] font-mono" style={{ color: C.green }}>
              {lastDone.title || lastDone.body?.slice(0, 80) || "—"}
            </span>
            <span className="text-[9px] font-mono" style={{ color: C.muted }}>
              {fmtRelative(lastDone.created_at)}
            </span>
          </div>
        )}
      </div>
    );
  }

  /* ── BLOCKED ── */
  if (isBlocked) {
    return (
      <div
        className="rounded-xl border p-5 flex flex-col gap-3 transition-all"
        style={{
          borderColor: `${C.red}60`,
          background:  "rgba(239,68,68,0.06)",
          boxShadow:   `0 0 20px rgba(239,68,68,0.12)`,
        }}
      >
        <div className="flex items-center justify-between flex-wrap gap-2">
          <span className="text-xs font-mono font-bold px-2 py-1 rounded" style={{ color: C.red, background: `${C.red}20`, border: `1px solid ${C.red}40` }}>
            🚫 NEEDS YOUR ATTENTION
          </span>
          <div className="flex items-center gap-3">
            <ManavBadge variant="blocked" />
            <span className="text-[9px] font-mono" style={{ color: C.muted }}>
              Stopped at {fmtTime(blocked!.created_at)}
            </span>
          </div>
        </div>
        {(blocked!.metadata?.module_num || blocked!.metadata?.task) && (
          <div className="text-[10px] font-mono" style={{ color: C.muted }}>
            {blocked!.metadata?.module_num && `MODULE ${String(blocked!.metadata.module_num).padStart(2,"0")}`}
            {blocked!.metadata?.task && ` · TASK ${blocked!.metadata.task}`}
          </div>
        )}
        <div className="border-t border-b py-3" style={{ borderColor: `${C.red}25` }}>
          <p className="text-sm leading-relaxed font-medium" style={{ color: "#f0a0a0" }}>
            {blocked!.body || blocked!.title || "Blocked — check the build log for details."}
          </p>
        </div>
        <p className="text-[9px] font-mono" style={{ color: C.muted }}>
          Resolve the blocker, then post a bridge status to resume.
        </p>
      </div>
    );
  }

  /* ── ACTIVE (thinking or instruction) ── */
  const meta       = primary.metadata || {};
  const moduleNum  = meta.module_num  ? String(meta.module_num).padStart(2, "0") : null;
  const taskId     = meta.task        || (meta.module ? meta.module : null);
  const isThinking = primary.kind === "thinking";

  // Split body into first sentence (headline) and rest (why it matters)
  const bodyText   = primary.body || primary.title || "";
  const sentenceEnd = bodyText.search(/(?<=[.!?])\s+[A-Z]/);
  const headline   = sentenceEnd > 0 ? bodyText.slice(0, sentenceEnd + 1) : bodyText;
  const whyText    = sentenceEnd > 0 ? bodyText.slice(sentenceEnd + 1).trim() : "";

  return (
    <div
      className="rounded-xl border p-5 flex flex-col gap-4 transition-all"
      style={{
        borderColor: isThinking ? `${C.blue}35` : `${C.indigo}30`,
        background:  C.card,
      }}
    >
      {/* Header row — badge alone, elapsed at right */}
      <div className="flex items-center justify-between gap-2">
        <ManavBadge variant="coding" />
        <span className="text-[10px] font-mono tabular-nums" style={{ color: elapsed ? C.blue : C.muted }}>
          {elapsed || "—"}
        </span>
      </div>

      {/* Main text — large, readable, plain English */}
      <div className="border-t border-b py-4" style={{ borderColor: C.border }}>
        <p className="text-[15px] leading-relaxed font-medium" style={{ color: "#dde0f0", letterSpacing: "0.01em" }}>
          {headline}
        </p>
      </div>

      {/* Why it matters */}
      {whyText && (
        <div className="flex flex-col gap-1">
          <span className="text-[9px] font-mono uppercase tracking-widest" style={{ color: C.muted }}>
            WHY THIS MATTERS
          </span>
          <p className="text-[12px] leading-relaxed" style={{ color: "#8888a8" }}>
            {whyText}
          </p>
        </div>
      )}

      {/* Footer — module · task · started */}
      <div className="flex items-center gap-3 flex-wrap pt-1 border-t" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
        {(moduleNum || taskId) && (
          <span className="text-[10px] font-mono" style={{ color: C.muted }}>
            {moduleNum && `Module ${moduleNum}`}{taskId && ` · Task ${taskId}`}
          </span>
        )}
        <span className="text-[10px] font-mono" style={{ color: "#3c3c58" }}>
          Started {fmtTime(primary.created_at)}
        </span>
        {meta.sha && (
          <span className="flex items-center gap-1 text-[10px] font-mono ml-auto" style={{ color: "#3c3c58" }}>
            <GitCommit size={8} /> {meta.sha}
          </span>
        )}
      </div>
    </div>
  );
}

/** Running activity stream — plain-English lines derived from bridge messages */
function LiveActivity({ messages }: { messages: BridgeMsg[] }) {
  const lines = deriveActivityLines(messages);
  if (lines.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 px-0.5">
        <Activity size={10} style={{ color: C.muted }} />
        <span
          className="text-[9px] font-mono font-bold uppercase tracking-widest"
          style={{ color: C.muted }}
        >
          Live Activity
        </span>
      </div>
      <div className="flex flex-col gap-0.5">
        {lines.map((line, i) => (
          <div
            key={line.id}
            className="flex items-start gap-2 py-1.5 px-2.5 rounded-lg"
            style={{
              background:      "rgba(255,255,255,0.025)",
              border:          "1px solid rgba(255,255,255,0.045)",
              animation:       "slideIn 250ms ease-out both",
              animationDelay:  `${i * 50}ms`,
            }}
          >
            <span
              className="text-[12px] font-mono flex-shrink-0 leading-none mt-0.5"
              style={{ color: line.color, minWidth: 12, textAlign: "center" }}
            >
              {line.icon}
            </span>
            <span
              className="text-[10px] font-mono flex-1 leading-relaxed break-words"
              style={{ color: "#9090b8" }}
            >
              {line.text}
            </span>
            <span
              className="text-[9px] font-mono flex-shrink-0 mt-0.5"
              style={{ color: "#3c3c58" }}
            >
              {fmtRelative(line.time)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── King's News Headline Generator ── */
const HEADLINE_SEEDS: string[] = [
  "👑 SEO Season — the only system that learns from every client forever",
  "🧠 9 intelligence streams now feeding Brain Memory automatically",
  "🌍 Any market · Any language · Any culture — empire without borders",
  "⚡ The Closed Loop — tasks that verify themselves are building next",
  "📈 Every verified outcome is a brick in the moat no competitor can cross",
  "🏰 Module 01 complete — foundation of the most intelligent SEO empire ever built",
];

function generateNewsHeadlines(messages: BridgeMsg[]): string[] {
  const headlines: string[] = [];
  const seen = new Set<string>();
  const add = (h: string) => {
    if (!seen.has(h) && h.length <= 88) { seen.add(h); headlines.push(h); }
  };
  const sorted = [...messages].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  for (const m of sorted.slice(0, 50)) {
    const text = ((m.title || "") + " " + (m.body || "")).toLowerCase();
    if (/MODULE_01_DONE/i.test(text) || (m.metadata?.module_done && m.metadata?.module_num === 1))
      add("👑 Foundation sealed — Brain quality gate now universal across the empire");
    if (text.includes("savelearninglocal") || text.includes("save_learning"))
      add("🧠 Intelligence pipeline hardened — every AI insight classified and remembered forever");
    if (text.includes("quicksave") || text.includes("market-researcher"))
      add("⚡ Market intelligence now flows into Brain memory — zero insight lost");
    if (text.includes("system_errors") || text.includes("logerror"))
      add("🔍 Empire-wide error visibility live — nothing fails in silence anymore");
    if (text.includes("dashboard") || text.includes("build.tsx"))
      add("👁 King's Command Centre online — 12 modules under live surveillance");
    if (text.includes("bridge"))
      add("🌉 Neural bridge active — Claude Chat and Claude Code in direct communication");
    if (m.kind === "dump")
      add("📡 Empire intelligence snapshot taken — all systems mapped and verified");
    if ((m.metadata?.status === "done" || m.metadata?.module_done) && headlines.length < 4) {
      const raw = (m.title || m.body || "").replace(/[<>{}[\]]/g, "").trim().slice(0, 60);
      if (raw.length > 8) add(`✓ ${raw}`);
    }
    if (headlines.length >= 5) break;
  }
  for (const s of HEADLINE_SEEDS) add(s);
  return headlines;
}

/* ── King's News Ticker ── */
function NewsTicker({ messages }: { messages: BridgeMsg[] }) {
  const headlines = generateNewsHeadlines(messages);

  return (
    <div
      className="flex-shrink-0 relative overflow-hidden"
      style={{
        height:       36,
        background:   "linear-gradient(to right, rgba(99,102,241,0.12), rgba(99,102,241,0.06), rgba(99,102,241,0.12))",
        borderTop:    "0.5px solid rgba(99,102,241,0.3)",
        borderBottom: "0.5px solid rgba(99,102,241,0.3)",
        display: "flex", alignItems: "center",
      }}
    >
      {/* Fade edges */}
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 40, zIndex: 2, background: "linear-gradient(to right, #0a0a0f, transparent)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 40, zIndex: 2, background: "linear-gradient(to left, #0a0a0f, transparent)", pointerEvents: "none" }} />

      <div
        style={{
          display: "inline-flex", alignItems: "center",
          whiteSpace: "nowrap",
          fontSize: 12, fontWeight: 500, color: "#a5b4fc",
          animation: "ticker 60s linear infinite",
          paddingLeft: 20,
        }}
        onMouseEnter={e => ((e.currentTarget as HTMLDivElement).style.animationPlayState = "paused")}
        onMouseLeave={e => ((e.currentTarget as HTMLDivElement).style.animationPlayState = "running")}
      >
        {[0, 1].map(copy => headlines.map((h, i) => (
          <React.Fragment key={`${copy}-${i}`}>
            <span>{h}</span>
            <span style={{ color: "#6366f1", fontSize: 14, padding: "0 10px" }}>✦</span>
          </React.Fragment>
        )))}
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
  // Prefer explicit bridge context post (bridge context <pct> <status> <detail>),
  // fall back to conversation_length metadata from claude_chat messages.
  const ctxFromBridge = (() => {
    const sorted = [...messages].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const m = sorted.find(m => m.metadata?.task === "chat_context" && m.metadata?.percent != null);
    if (!m) return null;
    return {
      pct:    Math.min(100, Math.max(0, Number(m.metadata.percent))),
      detail: (m.metadata.detail as string) || "",
      label:  (m.metadata.label  as string) || "",
    };
  })();

  const ctxFromWords = (() => {
    const sorted = [...messages].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const cc = sorted.find(m => m.created_by === "claude_chat" && m.metadata?.conversation_length);
    return cc ? Math.min(100, Math.round((Number(cc.metadata.conversation_length) / 100_000) * 100)) : null;
  })();

  const ctxPct    = ctxFromBridge?.pct ?? ctxFromWords;
  const ctxDetail = ctxFromBridge?.detail ?? null;
  const ctxColor  = ctxPct == null ? C.muted : ctxPct >= 90 ? C.red : ctxPct >= 70 ? C.yellow : C.green;
  const ctxLabel  = ctxFromBridge?.label
    || (ctxPct == null ? "unknown" : ctxPct >= 90 ? "⚠ START FRESH" : ctxPct >= 70 ? "Consider fresh chat" : "OK");

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

  // Latest instruction from Claude Chat
  const chatInstruction = (() => {
    const sorted = [...messages].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return sorted.find(m => m.created_by === "claude_chat" && m.kind === "instruction") || null;
  })();

  return (
    <div className={`flex gap-3 ${isMobile ? "flex-col" : ""}`}>
      {/* CLAUDE CHAT */}
      <div className={tile} style={{ ...tileStyle, flex: 1 }}>
        <div className="flex items-center gap-2">
          <MessageSquare size={11} style={{ color: C.purple }} />
          <span className="text-[9px] font-mono uppercase tracking-wider" style={{ color: C.muted }}>Claude Chat</span>
        </div>
        {chatInstruction ? (
          <>
            <p className="text-[9px] font-mono uppercase tracking-wider" style={{ color: C.purple }}>
              💬 Currently thinking:
            </p>
            <p
              className="text-[10px] font-mono leading-relaxed line-clamp-3"
              style={{ color: "#9090b8" }}
            >
              &ldquo;{(chatInstruction.body || chatInstruction.title || "").slice(0, 120)}&rdquo;
            </p>
            <div className="border-t pt-1.5 flex flex-col gap-0.5" style={{ borderColor: "rgba(255,255,255,0.05)" }}>
              <span className="text-[9px] font-mono" style={{ color: C.muted }}>
                Last instruction: {fmtRelative(chatInstruction.created_at)}
              </span>
              {(chatInstruction.metadata?.module_num || chatInstruction.metadata?.task) && (
                <span className="text-[9px] font-mono" style={{ color: "#4444aa" }}>
                  Waiting for: Module {chatInstruction.metadata?.module_num
                    ? String(chatInstruction.metadata.module_num).padStart(2, "0")
                    : "?"}{chatInstruction.metadata?.task ? ` · Task ${chatInstruction.metadata.task}` : ""} completion
                </span>
              )}
            </div>
          </>
        ) : (
          <p className="text-[10px] font-mono leading-relaxed" style={{ color: C.muted }}>
            Claude Chat is connected. Instructions will appear here.
          </p>
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
  const [refreshFlash,   setRefreshFlash]   = useState(false);

  const intervalRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const cdRef           = useRef<ReturnType<typeof setInterval> | null>(null);
  const feedScrollRef   = useRef<HTMLDivElement | null>(null);
  const moduleScrollRef = useRef<HTMLDivElement | null>(null);
  const savedFeedScroll = useRef(0);
  const savedModScroll  = useRef(0);
  const prevMsgIdsRef   = useRef<Set<string>>(new Set());
  const activeTabRef    = useRef<ActiveTab>("modules");
  const kbHandlerRef    = useRef<(e: KeyboardEvent) => void>(() => {});

  /* ── Derived ── */
  const moduleMap   = buildModuleMap(messages);
  const doneCount   = MODULES.filter(m => deriveModuleStatus(moduleMap[m.num] || []) === "done").length;
  const sorted      = [...messages].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const activeTask  = findActiveTask(messages); // used in generateHandoff
  const progressPct = Math.round((doneCount / 12) * 100);

  // Bridge-first context pct (for Fresh Chat button threshold)
  const ctxPct = (() => {
    const bridgeCtx = sorted.find(m => m.metadata?.task === "chat_context" && m.metadata?.percent != null);
    if (bridgeCtx) return Math.min(100, Math.max(0, Number(bridgeCtx.metadata.percent)));
    const cc = sorted.find(m => m.created_by === "claude_chat" && m.metadata?.conversation_length);
    return cc ? Math.min(100, Math.round((Number(cc.metadata.conversation_length) / 100_000) * 100)) : 0;
  })();

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

  /* ── Keep activeTabRef current so fetchBridge can read it without stale closure ── */
  useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);

  /* ── Auto-expand building module ── */
  useEffect(() => {
    const buildingMod = MODULES.find(m => deriveModuleStatus(moduleMap[m.num] || []) === "building");
    if (buildingMod && expandedMod === null) {
      setExpandedMod(buildingMod.num);
    }
  }, [messages]);

  /* ── Fetch ── */
  // fetchBridge has no stale deps — uses refs for activeTab and previous msg IDs.
  // Returns the freshly fetched messages so fetchAll can pass them to fetchHealth immediately.
  const fetchBridge = useCallback(async (): Promise<BridgeMsg[]> => {
    if (!BRIDGE_TOKEN) { setError("VITE_BRIDGE_READ_TOKEN not set in .env"); return []; }
    setLoading(true);
    setError(null);

    // Save scroll positions before state update reflushes the DOM
    if (feedScrollRef.current)   savedFeedScroll.current = feedScrollRef.current.scrollTop;
    if (moduleScrollRef.current) savedModScroll.current  = moduleScrollRef.current.scrollTop;

    try {
      const [listR, usageR] = await Promise.all([
        bridgeCall("list",  { limit: 200 }),
        bridgeCall("usage", {}),
      ]);
      let freshMsgs: BridgeMsg[] = [];
      if (listR.ok) {
        freshMsgs = listR.messages || [];
        const freshIds = new Set(
          freshMsgs.filter(m => !prevMsgIdsRef.current.has(m.id)).map(m => m.id)
        );
        if (freshIds.size > 0) {
          setNewMsgIds(freshIds);
          if (activeTabRef.current !== "log") setLogBadgeCount(c => c + freshIds.size);
          setTimeout(() => setNewMsgIds(new Set()), 3000);
        }
        prevMsgIdsRef.current = new Set(freshMsgs.map(m => m.id));
        setMessages(freshMsgs);
      } else {
        setError(listR.error || "Bridge list failed");
      }
      if (usageR.ok) setUsage(usageR.usage);
      return freshMsgs;
    } catch (e: any) {
      setError(e?.message || "Bridge fetch failed");
      return [];
    } finally {
      setLoading(false);
      setLastFetch(new Date());
      setCountdown(20);
      requestAnimationFrame(() => {
        if (feedScrollRef.current)   feedScrollRef.current.scrollTop   = savedFeedScroll.current;
        if (moduleScrollRef.current) moduleScrollRef.current.scrollTop = savedModScroll.current;
      });
    }
  }, []); // stable — no stale closure deps

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

  // fetchAll is the single refresh entry point.
  // All derived data (health, costs) is rebuilt from the fresh messages in one pass.
  const fetchAll = useCallback(async () => {
    setRefreshFlash(true);
    const freshMsgs = await fetchBridge();
    await Promise.all([
      fetchCosts(),
      freshMsgs.length > 0 ? fetchHealth(freshMsgs) : Promise.resolve(),
    ]);
    setTimeout(() => setRefreshFlash(false), 200);
  }, [fetchBridge, fetchCosts, fetchHealth]);

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
          {/* Gradient progress bar — 6px, #6366f1 → #10b981 */}
          <div style={{ height: 6, borderRadius: 3, background: "#1e1e3a", overflow: "hidden" }}>
            <div style={{
              height: "100%", width: `${progressPct}%`,
              background: "linear-gradient(to right, #6366f1, #10b981)",
              borderRadius: 3,
              transition: "width 0.6s ease",
            }} />
          </div>
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
      <div className="flex-1 overflow-y-auto px-4 pb-4 flex flex-col gap-4" style={{ scrollbarWidth: "thin" }}>
        <ActiveTaskCard messages={messages} />
        <LiveActivity messages={messages} />
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
        <NewsTicker messages={messages} />
        {Banners}
        <div className="flex-1 overflow-hidden" style={{ opacity: refreshFlash ? 0.8 : 1, transition: "opacity 200ms ease" }}>
          {activeTab === "modules" && ModulePanel}
          {activeTab === "active"  && ActivePanel}
          {activeTab === "log"     && FeedPanel}
          {activeTab === "usage"   && UsagePanel}
        </div>
        <MobileTabBar active={activeTab} onChange={t => { setActiveTab(t); if (t === "log") setLogBadgeCount(0); }} logBadge={logBadgeCount} />
        {showFreshChat && <FreshChatModal content={handoffContent} onClose={() => setShowFreshChat(false)} />}
        <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } } @keyframes slideIn { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } } @keyframes ticker { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } } @keyframes pulseBlue { 0%,100% { box-shadow: 0 0 12px rgba(59,130,246,0.3); } 50% { box-shadow: 0 0 22px rgba(59,130,246,0.65); } } @keyframes pulseRed { 0%,100% { box-shadow: 0 0 8px rgba(239,68,68,0.2); } 50% { box-shadow: 0 0 18px rgba(239,68,68,0.55); } }`}</style>
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
        <NewsTicker messages={messages} />
        {Banners}
        <div className="flex flex-1 overflow-hidden" style={{ minHeight: 0, opacity: refreshFlash ? 0.8 : 1, transition: "opacity 200ms ease" }}>
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
        <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } } @keyframes slideIn { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } } @keyframes ticker { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } } @keyframes pulseBlue { 0%,100% { box-shadow: 0 0 12px rgba(59,130,246,0.3); } 50% { box-shadow: 0 0 22px rgba(59,130,246,0.65); } } @keyframes pulseRed { 0%,100% { box-shadow: 0 0 8px rgba(239,68,68,0.2); } 50% { box-shadow: 0 0 18px rgba(239,68,68,0.55); } }`}</style>
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
        <NewsTicker messages={messages} />
        {Banners}
        <div className="flex flex-1 overflow-hidden" style={{ minHeight: 0, opacity: refreshFlash ? 0.8 : 1, transition: "opacity 200ms ease" }}>
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
        <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } } @keyframes slideIn { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } } @keyframes ticker { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } } @keyframes pulseBlue { 0%,100% { box-shadow: 0 0 12px rgba(59,130,246,0.3); } 50% { box-shadow: 0 0 22px rgba(59,130,246,0.65); } } @keyframes pulseRed { 0%,100% { box-shadow: 0 0 8px rgba(239,68,68,0.2); } 50% { box-shadow: 0 0 18px rgba(239,68,68,0.55); } }`}</style>
      </div>
    );
  }

  /* ══════════════════════════════════════════════════════════
     ULTRAWIDE LAYOUT — 3 column, max-width 1800px, extras
  ══════════════════════════════════════════════════════════ */
  return (
    <div className="h-screen flex flex-col font-sans select-none overflow-hidden" style={{ background: C.bg, color: C.text }}>
      {TopBar}
      <NewsTicker messages={messages} />
      {Banners}
      <div className="flex-1 overflow-hidden flex justify-center" style={{ minHeight: 0, opacity: refreshFlash ? 0.8 : 1, transition: "opacity 200ms ease" }}>
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
      <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } } @keyframes slideIn { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } } @keyframes ticker { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } } @keyframes pulseBlue { 0%,100% { box-shadow: 0 0 12px rgba(59,130,246,0.3); } 50% { box-shadow: 0 0 22px rgba(59,130,246,0.65); } } @keyframes pulseRed { 0%,100% { box-shadow: 0 0 8px rgba(239,68,68,0.2); } 50% { box-shadow: 0 0 18px rgba(239,68,68,0.55); } }`}</style>
    </div>
  );
}
