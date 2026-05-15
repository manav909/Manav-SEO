/* ═══════════════════════════════════════════════════════════
   src/pages/Build.tsx — King's Command Dashboard
   Fixed-position architecture: header / ticker / sidebar /
   content-area / bottom-nav / right-aside.
   Every element is permanently mounted; panels toggle via
   visibility + pointer-events so layout never reflows.
═══════════════════════════════════════════════════════════ */

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  RefreshCw, Loader2, Crown, GitCommit,
  DollarSign, Activity, Pause, Play,
  Clock, X, MessageSquare, Terminal, Radio,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";

/* ═══════════════════════════════════════════════════════════
   ENV
═══════════════════════════════════════════════════════════ */

const BRIDGE_TOKEN  = import.meta.env.VITE_BRIDGE_READ_TOKEN as string | undefined;
const BRIDGE_SECRET = import.meta.env.VITE_BRIDGE_SECRET     as string | undefined;
const BRIDGE_URL    = "/api/bridge";

/* ═══════════════════════════════════════════════════════════
   Types
═══════════════════════════════════════════════════════════ */

type ModStatus = "pending" | "building" | "testing" | "done" | "blocked" | "paused";
type ActiveTab = "modules" | "active" | "log" | "health";

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

interface ActivityLine {
  id:    string;
  icon:  string;
  color: string;
  text:  string;
  time:  string;
}

/* ═══════════════════════════════════════════════════════════
   useScreen hook — RAF-debounced, rich breakpoint flags
═══════════════════════════════════════════════════════════ */

function useScreen() {
  const [screen, setScreen] = useState({
    width:  typeof window !== "undefined" ? window.innerWidth  : 1280,
    height: typeof window !== "undefined" ? window.innerHeight : 800,
  });

  useEffect(() => {
    let rafId: number;
    const handle = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() =>
        setScreen({ width: window.innerWidth, height: window.innerHeight })
      );
    };
    window.addEventListener("resize", handle);
    return () => { window.removeEventListener("resize", handle); cancelAnimationFrame(rafId); };
  }, []);

  const { width, height } = screen;
  return {
    width, height,
    isMobile:  width < 1024,
    isDesktop: width >= 1024,
    isWide:    width >= 1440,
    isUltra:   width >= 1920,
    label: width < 768  ? "mobile"
         : width < 1024 ? "tablet"
         : width < 1440 ? "desktop"
         : width < 1920 ? "wide"
         : "ultrawide",
  };
}

/* ═══════════════════════════════════════════════════════════
   CSS variables — injected once into <head>
═══════════════════════════════════════════════════════════ */

const EMPIRE_CSS = `
  :root {
    --header-h:    56px;
    --ticker-h:    36px;
    --chrome-h:    92px;
    --nav-h:       60px;
    --sidebar-w:   260px;
    --aside-w:     300px;
    --safe-top:    env(safe-area-inset-top,    0px);
    --safe-bottom: env(safe-area-inset-bottom, 0px);
    --safe-left:   env(safe-area-inset-left,   0px);
    --safe-right:  env(safe-area-inset-right,  0px);
    --void:    #070710;
    --surface: #0d0d1a;
    --elevated:#12122a;
    --border:  #1e1e3a;
    --border-dim: #141428;
    --text-1:  #f0f0ff;
    --text-2:  #8b8ba8;
    --text-3:  #4b4b6a;
    --brain:        #6366f1;
    --brain-light:  #818cf8;
    --crown:        #f59e0b;
    --green:        #10b981;
    --blue:         #3b82f6;
    --yellow:       #eab308;
    --red:          #ef4444;
    --orange:       #f97316;
    --cyan:         #06b6d4;
  }
  * { box-sizing: border-box; }
  body { background: var(--void); margin: 0; }
  @keyframes ticker-scroll {
    0%   { transform: translateX(0); }
    100% { transform: translateX(-50%); }
  }
  @keyframes pulse-blue {
    0%,100% { box-shadow: 0 0 12px rgba(59,130,246,0.3); }
    50%     { box-shadow: 0 0 22px rgba(59,130,246,0.65); }
  }
  @keyframes pulse-red {
    0%,100% { box-shadow: 0 0 8px rgba(239,68,68,0.2); }
    50%     { box-shadow: 0 0 18px rgba(239,68,68,0.55); }
  }
  @keyframes live-dot {
    0%,100% { opacity: 1; }
    50%     { opacity: 0.3; }
  }
  @keyframes activity-in {
    from { opacity: 0; transform: translateY(-4px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes ptr-spin {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
  }
  @keyframes fade-in {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
  ::-webkit-scrollbar { width: 4px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: #2a2a4a; border-radius: 2px; }
`;

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

/**
 * Derive module status — DONE only from explicit signals:
 *   meta.module_done === true  OR  MODULE_NN_DONE in body/title
 */
function deriveModuleStatus(msgs: BridgeMsg[]): ModStatus {
  if (!msgs.length) return "pending";
  for (const m of msgs) {
    if (m.metadata?.module_done === true)          return "done";
    if (/MODULE_\d+_DONE/i.test(m.body  || ""))   return "done";
    if (/MODULE_\d+_DONE/i.test(m.title || ""))   return "done";
  }
  const latest = msgs[0];
  const meta   = latest.metadata || {};
  const status = (meta.status as string) || "";
  const kind   = latest.kind;
  const body   = (latest.body || "").toLowerCase();

  if (status === "blocked") return "blocked";
  if (status === "paused")  return "paused";
  if (kind === "instruction" && (status === "pending" || status === "executing" || !status)) return "building";
  if (kind === "response" && (status === "done" || meta.tsc_clean || meta.ts_status === "clean")) return "testing";
  if (kind === "status") {
    if (body.includes("paused"))                               return "paused";
    if (body.includes("blocked"))                              return "blocked";
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
    const s = [...tmsgs].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return { name, status: deriveModuleStatus(s), latest: s[0] || null };
  });
}

function findActiveTask(messages: BridgeMsg[]): BridgeMsg | null {
  const s = [...messages].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return s.find(m => m.metadata?.status === "blocked")
      || s.find(m => m.metadata?.status === "executing" || m.metadata?.status === "pending")
      || s[0] || null;
}

function deriveActivityLines(messages: BridgeMsg[]): ActivityLine[] {
  const lines: ActivityLine[] = [];
  const sorted = [...messages].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  for (const m of sorted) {
    const meta  = m.metadata || {};
    const title = m.title || "";
    const body  = m.body  || "";
    const kind  = m.kind;

    if (kind === "thinking") {
      const t = body || title;
      lines.push({ id: m.id + ":thinking", icon: "→", color: "#3b82f6", text: "Starting: " + t.slice(0, 60) + (t.length > 60 ? "…" : ""), time: m.created_at });
    } else if (kind === "dump") {
      lines.push({ id: m.id + ":dump", icon: "⚙", color: "#4b5563", text: "System snapshot posted", time: m.created_at });
    } else if (kind === "response") {
      if (meta.tsc_clean || meta.ts_status === "clean")
        lines.push({ id: m.id + ":ts", icon: "✓", color: "#10b981", text: "TypeScript: clean", time: m.created_at });
      if (meta.sha)
        lines.push({ id: m.id + ":commit", icon: "✓", color: "#10b981", text: `Committed: ${meta.sha}${meta.branch ? ` (${meta.branch})` : ""}`, time: m.created_at });
      if (!meta.tsc_clean && !meta.ts_status && !meta.sha && meta.status === "done") {
        const t = title || body.slice(0, 60);
        lines.push({ id: m.id + ":response", icon: "✓", color: "#10b981", text: t.slice(0, 60) + (t.length > 60 ? "…" : ""), time: m.created_at });
      }
    } else if (kind === "status") {
      if (meta.status === "blocked") {
        const t = title || body;
        lines.push({ id: m.id + ":blocked", icon: "!", color: "#eab308", text: "Blocked: " + t.slice(0, 55) + (t.length > 55 ? "…" : ""), time: m.created_at });
      } else if (meta.task && meta.status === "done") {
        lines.push({ id: m.id + ":task-done", icon: "✓", color: "#10b981", text: `${meta.task} complete`, time: m.created_at });
      } else if (meta.module_done) {
        lines.push({ id: m.id + ":mod-done", icon: "✓", color: "#10b981", text: title.slice(0, 60) || "Module complete", time: m.created_at });
      }
    } else if (kind === "instruction") {
      const t = title || body.slice(0, 60);
      lines.push({ id: m.id + ":instr", icon: "→", color: "#6366f1", text: t.slice(0, 60) + (t.length > 60 ? "…" : ""), time: m.created_at });
    }

    if (lines.length >= 14) break;
  }
  return lines;
}

/* ═══════════════════════════════════════════════════════════
   API
═══════════════════════════════════════════════════════════ */

async function bridgeCall(action: string, payload: Record<string, any> = {}, useWrite = false): Promise<any> {
  const token = useWrite ? BRIDGE_SECRET : BRIDGE_TOKEN;
  if (!token) return { error: "No token" };
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (useWrite) headers["Authorization"] = `Bearer ${token}`;
  const url = useWrite ? BRIDGE_URL : `${BRIDGE_URL}?token=${encodeURIComponent(token)}`;
  try {
    const res = await fetch(url, { method: "POST", headers, body: JSON.stringify({ action, ...payload }) });
    return res.json();
  } catch (e: any) {
    return { error: e?.message || "fetch failed" };
  }
}

/* ═══════════════════════════════════════════════════════════
   Handoff generator
═══════════════════════════════════════════════════════════ */

function generateHandoff(messages: BridgeMsg[], modMap: Record<number, BridgeMsg[]>): string {
  const done  = MODULES.filter(m => deriveModuleStatus(modMap[m.num] || []) === "done").length;
  const lines = [
    "# SEO SEASON — EMPIRE BUILD HANDOFF",
    `Generated: ${new Date().toISOString()}`,
    "",
    `## Module Status (${done}/12 complete)`,
    "",
    ...MODULES.map(m => {
      const s = deriveModuleStatus(modMap[m.num] || []);
      return `${s === "done" ? "✅" : s === "building" ? "⚡" : s === "blocked" ? "🚫" : "⬜"} MODULE ${String(m.num).padStart(2, "0")} — ${m.name} [${s.toUpperCase()}]`;
    }),
  ];
  const active = findActiveTask(messages);
  if (active) {
    lines.push("", "## Active Task", "",
      `Module: ${active.metadata?.module_num ?? "?"} · Task: ${active.metadata?.task ?? "?"}`,
      active.body?.slice(0, 400) || "(no body)", "");
  }
  lines.push("", "---", "Paste into a new Claude Chat to continue the build.");
  return lines.join("\n");
}

/* ═══════════════════════════════════════════════════════════
   News ticker headlines
═══════════════════════════════════════════════════════════ */

const HEADLINE_SEEDS = [
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
  const add = (h: string) => { if (!seen.has(h) && h.length <= 90) { seen.add(h); headlines.push(h); } };
  const sorted = [...messages].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
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

/* ═══════════════════════════════════════════════════════════
   Small reusable components
═══════════════════════════════════════════════════════════ */

function ModStatusPill({ status }: { status: ModStatus }) {
  const cfg: Record<ModStatus, { bg: string; color: string; border: string; label: string }> = {
    pending:  { bg: "#0d0d1a", color: "#4b4b6a", border: "0.5px solid #2a2a3a", label: "PENDING"  },
    building: { bg: "#0d1830", color: "#3b82f6", border: "0.5px solid #3b82f6", label: "BUILDING" },
    testing:  { bg: "#1a1400", color: "#eab308", border: "0.5px solid #eab308", label: "TESTING"  },
    done:     { bg: "#051008", color: "#10b981", border: "0.5px solid #10b981", label: "DONE"     },
    blocked:  { bg: "#1a0505", color: "#ef4444", border: "0.5px solid #ef4444", label: "BLOCKED"  },
    paused:   { bg: "#1a0e00", color: "#f97316", border: "0.5px solid #f97316", label: "PAUSED"   },
  };
  const c = cfg[status];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", fontSize: 9, fontFamily: "monospace", fontWeight: 600, letterSpacing: "0.08em", padding: "2px 8px", borderRadius: 20, background: c.bg, color: c.color, border: c.border }}>
      {c.label}
    </span>
  );
}

function useDotsAnimation(active: boolean): string {
  const [dots, setDots] = useState(1);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setDots(d => d === 3 ? 1 : d + 1), 500);
    return () => clearInterval(id);
  }, [active]);
  return ".".repeat(dots);
}

function ManavBadge({ variant }: { variant: "coding" | "blocked" | "delivered" | "ready" }) {
  const dots = useDotsAnimation(variant === "coding");
  const cfg = {
    coding:    { text: `👑 Manav Coding${dots}`, border: "#6366f1", color: "#818cf8" },
    blocked:   { text: "👑 Manav Needs You",      border: "#ef4444", color: "#ef4444" },
    delivered: { text: "👑 Manav Delivered",       border: "#10b981", color: "#10b981" },
    ready:     { text: "👑 Manav Ready",           border: "#374151", color: "#6b7280" },
  }[variant];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", background: "linear-gradient(135deg,#1a1040,#0d0820)", border: `0.5px solid ${cfg.border}`, color: cfg.color, fontSize: 12, fontWeight: 500, borderRadius: 20, padding: "4px 14px", whiteSpace: "nowrap", transition: "color 0.3s, border-color 0.3s" }}>
      {cfg.text}
    </span>
  );
}

function useElapsed(startIso: string | null): string {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!startIso) return;
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [startIso]);
  if (!startIso) return "";
  const s = Math.floor((Date.now() - new Date(startIso).getTime()) / 1000);
  if (s < 60)   return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

/* ═══════════════════════════════════════════════════════════
   ActiveHeroCard — extracted so useElapsed is called
   unconditionally at the top of a proper component.
═══════════════════════════════════════════════════════════ */

function ActiveHeroCard({ msgs, lastDone }: {
  msgs:     BridgeMsg[];
  lastDone: BridgeMsg | null;
}) {
  const thinking    = msgs.find(m => m.kind === "thinking");
  const instruction = msgs.find(m => m.kind === "instruction");
  const blocked     = msgs.find(m => m.metadata?.status === "blocked");
  const primary     = thinking || instruction || null;
  const isBlocked   = !!blocked && !thinking;

  /* useElapsed is called unconditionally — no hooks-after-conditional */
  const elapsed = useElapsed(primary?.created_at ?? null);

  if (!primary) {
    return (
      <div style={{ borderRadius: 16, border: "0.5px solid var(--border)", background: "var(--surface)", padding: "48px 20px", textAlign: "center", marginBottom: 16 }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>⏳</div>
        <div style={{ fontSize: 11, letterSpacing: "2px", color: "var(--text-3)", marginBottom: 8 }}>STANDING BY</div>
        <div style={{ fontSize: 14, color: "#6b6b80" }}>Waiting for next instruction</div>
        {lastDone && (
          <div style={{ marginTop: 20, padding: "12px 16px", background: "var(--void)", borderRadius: 10, border: "0.5px solid var(--border)", textAlign: "left" }}>
            <div style={{ fontSize: 9, color: "var(--text-3)", marginBottom: 4 }}>LAST COMPLETED</div>
            <div style={{ fontSize: 13, color: "#10b981", fontWeight: 600 }}>{lastDone.title || lastDone.body?.slice(0, 80)}</div>
            <div style={{ fontSize: 10, color: "var(--text-3)", marginTop: 3 }}>{fmtRelative(lastDone.created_at)}</div>
          </div>
        )}
      </div>
    );
  }

  if (isBlocked) {
    return (
      <div style={{ borderRadius: 16, border: "0.5px solid rgba(239,68,68,0.5)", background: "rgba(239,68,68,0.06)", padding: 20, marginBottom: 16, boxShadow: "0 0 20px rgba(239,68,68,0.1)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
          <span style={{ fontSize: 12, fontFamily: "monospace", fontWeight: 700, padding: "4px 10px", borderRadius: 6, color: "#ef4444", background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)" }}>🚫 NEEDS ATTENTION</span>
          <ManavBadge variant="blocked" />
        </div>
        {(blocked!.metadata?.module_num || blocked!.metadata?.task) && (
          <div style={{ fontSize: 11, fontFamily: "monospace", color: "var(--text-3)", marginBottom: 10 }}>
            {blocked!.metadata?.module_num && `MODULE ${String(blocked!.metadata.module_num).padStart(2,"0")}`}
            {blocked!.metadata?.task && ` · TASK ${blocked!.metadata.task}`}
          </div>
        )}
        <p style={{ fontSize: 15, lineHeight: 1.6, color: "#f0a0a0", margin: "0 0 12px" }}>
          {blocked!.body || blocked!.title || "Blocked — check build log."}
        </p>
        <p style={{ fontSize: 10, fontFamily: "monospace", color: "var(--text-3)", margin: 0 }}>
          Resolve then post a bridge status to resume.
        </p>
      </div>
    );
  }

  const meta      = primary.metadata || {};
  const moduleNum = meta.module_num ? String(meta.module_num).padStart(2, "0") : null;
  const taskId    = meta.task || null;
  const bodyText  = primary.body || primary.title || "";
  const sentEnd   = bodyText.search(/(?<=[.!?])\s+[A-Z]/);
  const headline  = sentEnd > 0 ? bodyText.slice(0, sentEnd + 1) : bodyText;
  const whyText   = sentEnd > 0 ? bodyText.slice(sentEnd + 1).trim() : "";

  return (
    <div style={{ borderRadius: 16, border: `0.5px solid ${primary.kind === "thinking" ? "rgba(59,130,246,0.3)" : "rgba(99,102,241,0.25)"}`, background: "var(--surface)", padding: 20, marginBottom: 16, position: "relative", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ fontSize: 10, letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--text-3)" }}>ACTIVE RIGHT NOW</div>
        <ManavBadge variant="coding" />
      </div>

      <p style={{ fontSize: "clamp(16px,4vw,22px)", fontWeight: 500, color: "var(--text-1)", lineHeight: 1.55, margin: "0 0 16px" }}>
        {headline}
      </p>

      {whyText && (
        <>
          <div style={{ height: 1, background: "var(--border)", margin: "0 0 16px" }} />
          <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 4, letterSpacing: "0.8px" }}>WHY THIS MATTERS</div>
          <p style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.6, margin: "0 0 16px" }}>{whyText}</p>
        </>
      )}

      <div style={{ height: 1, background: "var(--border)", margin: "0 0 12px" }} />
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-3)" }}>
        <span>{moduleNum && `Module ${moduleNum}`}{taskId && ` · Task ${taskId}`}</span>
        <span style={{ fontFamily: "monospace", color: "#6366f1" }}>{elapsed}</span>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Module card
═══════════════════════════════════════════════════════════ */

function ModuleCard({
  mod, msgs, expanded, onToggle,
}: {
  mod:      typeof MODULES[0];
  msgs:     BridgeMsg[];
  expanded: boolean;
  onToggle: () => void;
}) {
  const status = deriveModuleStatus(msgs);
  const latest = msgs[0] || null;
  const tasks  = extractModuleTasks(msgs);

  const accentColor: Record<ModStatus, string> = {
    done: "#10b981", building: "#3b82f6", testing: "#eab308",
    blocked: "#ef4444", paused: "#f97316", pending: "transparent",
  };
  const boxBg: Record<ModStatus, string> = {
    pending:  "#0d0d1a",
    done:     "linear-gradient(135deg,rgba(16,185,129,0.04) 0%,transparent 60%)",
    building: "linear-gradient(135deg,rgba(59,130,246,0.05) 0%,transparent 60%)",
    testing:  "linear-gradient(135deg,rgba(234,179,8,0.04) 0%,transparent 60%)",
    blocked:  "linear-gradient(135deg,rgba(239,68,68,0.05) 0%,transparent 60%)",
    paused:   "linear-gradient(135deg,rgba(249,115,22,0.04) 0%,transparent 60%)",
  };
  const statusIcon: Record<ModStatus, { icon: string; color: string; anim?: string }> = {
    pending:  { icon: "",   color: "#2a2a3a" },
    done:     { icon: "✓",  color: "#10b981" },
    building: { icon: "⚡", color: "#3b82f6", anim: "pulse-blue 2s ease-in-out infinite" },
    testing:  { icon: "◎",  color: "#eab308" },
    blocked:  { icon: "✕",  color: "#ef4444", anim: "pulse-red 1.5s ease-in-out infinite" },
    paused:   { icon: "⏸", color: "#f97316" },
  };
  const si = statusIcon[status];

  return (
    <div style={{
      marginBottom: 8, borderRadius: 14, overflow: "hidden", position: "relative",
      border: `0.5px solid ${status === "pending" ? "var(--border)" : accentColor[status] + "50"}`,
      background: boxBg[status],
      boxShadow: status === "blocked" ? "0 0 16px rgba(239,68,68,0.08)"
               : status === "building" ? "0 0 12px rgba(59,130,246,0.06)"
               : undefined,
    }}>
      {/* Left accent bar */}
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, borderRadius: "14px 0 0 14px", background: accentColor[status] }} />

      {/* Header */}
      <button
        onClick={onToggle}
        style={{ width: "100%", textAlign: "left", background: "none", border: "none", cursor: "pointer", padding: "14px 14px 14px 18px", display: "flex", alignItems: "center", gap: 12, minHeight: 68, userSelect: "none" }}
      >
        {/* Status box */}
        <div style={{
          width: 40, height: 40, borderRadius: 10, flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 18, fontWeight: 700, color: si.color,
          border: `1.5px solid ${accentColor[status] === "transparent" ? "#2a2a3a" : accentColor[status]}`,
          background: status === "pending" ? "#0d0d1a"
                    : status === "done"    ? "rgba(16,185,129,0.1)"
                    : status === "building" ? "rgba(59,130,246,0.1)"
                    : status === "testing"  ? "rgba(234,179,8,0.08)"
                    : status === "blocked"  ? "rgba(239,68,68,0.1)"
                    : "rgba(249,115,22,0.08)",
          animation: si.anim,
          transition: "all 250ms ease",
        }}>
          {si.icon}
        </div>

        {/* Text */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10, letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--text-3)", marginBottom: 3 }}>
            MODULE {String(mod.num).padStart(2, "0")}
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-1)", whiteSpace: expanded ? "normal" : "nowrap", overflow: expanded ? "visible" : "hidden", textOverflow: "ellipsis", lineHeight: 1.25 }}>
            {mod.name}
          </div>
          <div style={{ marginTop: 5 }}>
            <ModStatusPill status={status} />
          </div>
        </div>

        {/* Right */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
          {latest && <span style={{ fontSize: 10, color: "var(--text-3)" }}>{fmtRelative(latest.created_at)}</span>}
          <span style={{ fontSize: 14, color: "var(--text-3)", transform: expanded ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 250ms ease", marginTop: 4, display: "block" }}>▾</span>
        </div>
      </button>

      {/* Expanded body — max-height transition */}
      <div style={{ maxHeight: expanded ? 400 : 0, overflow: "hidden", transition: "max-height 350ms ease" }}>
        <div style={{ borderTop: "0.5px solid #1a1a2e", padding: "12px 14px 14px 74px" }}>
          {tasks.length > 0 ? tasks.map((t, i) => (
            <div key={t.name} style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 36, paddingTop: 6, paddingBottom: 6, borderBottom: i < tasks.length - 1 ? "0.5px dashed #1a1a2e" : "none" }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: t.status === "done" ? "#10b981" : t.status === "building" ? "#3b82f6" : t.status === "blocked" ? "#ef4444" : "#4b4b6a", flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: "var(--text-2)", flex: 1 }}>Task {t.name}</span>
              <ModStatusPill status={t.status} />
              {t.latest && <span style={{ fontSize: 10, color: "var(--text-3)", marginLeft: 4 }}>{fmtRelative(t.latest.created_at)}</span>}
            </div>
          )) : (
            <p style={{ fontSize: 12, color: "var(--text-3)", fontStyle: "italic", margin: 0 }}>Tasks load as this module begins</p>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Feed entry (log panel)
═══════════════════════════════════════════════════════════ */

function FeedEntry({ msg, isNew = false }: { msg: BridgeMsg; isNew?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const meta  = msg.metadata || {};
  const whoColor = msg.created_by === "claude_chat" ? "#a855f7"
                 : msg.created_by === "claude_code"  ? "#06b6d4"
                 : "#f97316";
  const whoLabel = msg.created_by === "claude_chat" ? "CHAT"
                 : msg.created_by === "claude_code"  ? "CODE"
                 : "SYS";
  const kindColor = msg.kind === "thinking"    ? "#3b82f6"
                  : msg.kind === "instruction" ? "#6366f1"
                  : msg.kind === "response"    ? "#14b8a6"
                  : msg.kind === "status"      ? "#4b5563"
                  : "#06b6d4";

  return (
    <div style={{
      borderRadius: 12, border: `0.5px solid ${isNew ? "#3b82f680" : "var(--border)"}`,
      background: isNew ? "rgba(59,130,246,0.06)" : "var(--surface)",
      marginBottom: 8, overflow: "hidden", cursor: "pointer",
      boxShadow: isNew ? "0 0 8px rgba(59,130,246,0.15)" : undefined,
      animation: isNew ? "fade-in 0.4s ease" : undefined,
    }} onClick={() => setExpanded(v => !v)}>
      {/* Header row */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", padding: "10px 12px 6px" }}>
        <span style={{ fontSize: 9, fontFamily: "monospace", fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: whoColor + "20", color: whoColor, border: `1px solid ${whoColor}30` }}>{whoLabel}</span>
        <span style={{ fontSize: 9, fontFamily: "monospace", padding: "2px 6px", borderRadius: 4, background: kindColor + "18", color: kindColor, border: `1px solid ${kindColor}25` }}>{msg.kind}</span>
        {meta.module_num && <span style={{ fontSize: 9, fontFamily: "monospace", color: "var(--text-3)" }}>M{String(meta.module_num).padStart(2, "0")}{meta.task ? `·${meta.task}` : ""}</span>}
        <span style={{ marginLeft: "auto", fontSize: 9, fontFamily: "monospace", color: "var(--text-3)" }}>{fmtRelative(msg.created_at)}</span>
      </div>
      {/* Content */}
      {msg.title && <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-1)", padding: "0 12px 4px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{msg.title}</div>}
      <div style={{ maxHeight: expanded ? 800 : 40, overflow: "hidden", transition: "max-height 300ms ease", padding: "0 12px 10px", fontSize: 11, fontFamily: "monospace", color: "var(--text-3)", lineHeight: 1.5 }}>
        {msg.body}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Fresh Chat Modal
═══════════════════════════════════════════════════════════ */

function FreshChatModal({ content, onClose }: { content: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard.writeText(content).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }); };
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.8)", backdropFilter: "blur(6px)" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#12121a", border: "0.5px solid #a855f760", borderRadius: 16, padding: 24, maxWidth: 640, width: "calc(100% - 32px)", maxHeight: "80vh", display: "flex", flexDirection: "column", gap: 16, position: "relative" }}>
        <button onClick={onClose} style={{ position: "absolute", top: 16, right: 16, background: "none", border: "none", cursor: "pointer", color: "#6b6b80", fontSize: 18 }}>✕</button>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#a855f7" }}>🔄 FRESH CHAT HANDOFF</div>
          <div style={{ fontSize: 11, fontFamily: "monospace", color: "#6b6b80" }}>Copy into a new Claude Chat to continue the build.</div>
        </div>
        <div style={{ flex: 1, overflow: "auto", background: "#070710", border: "0.5px solid var(--border)", borderRadius: 8, padding: 12 }}>
          <pre style={{ fontSize: 10, fontFamily: "monospace", color: "#a0a0b0", whiteSpace: "pre-wrap", margin: 0 }}>{content}</pre>
        </div>
        <button onClick={copy} style={{ alignSelf: "flex-start", background: copied ? "#10b981" : "#a855f7", color: "#fff", border: "none", borderRadius: 8, padding: "8px 20px", fontSize: 12, fontFamily: "monospace", cursor: "pointer" }}>
          {copied ? "✓ Copied!" : "Copy to clipboard"}
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Main Build component
═══════════════════════════════════════════════════════════ */

export default function Build() {
  const screen = useScreen();
  const { isMobile, isDesktop, isWide } = screen;

  /* ── State ── */
  const [messages,      setMessages]      = useState<BridgeMsg[]>([]);
  const [usage,         setUsage]         = useState<UsageStats | null>(null);
  const [cost,          setCost]          = useState<CostData | null>(null);
  const [health,        setHealth]        = useState<HealthState>({ ts: "unknown", git: "unknown", db: "unknown", build: "unknown", ts_sha: "" });
  const [loading,       setLoading]       = useState(false);
  const [lastFetch,     setLastFetch]     = useState<Date | null>(null);
  const [countdown,     setCountdown]     = useState(20);
  const [error,         setError]         = useState<string | null>(null);
  const [isPaused,      setIsPaused]      = useState(false);
  const [posting,       setPosting]       = useState(false);
  const [expandedMod,   setExpandedMod]   = useState<number | null>(null);
  const [showFreshChat, setShowFreshChat] = useState(false);
  const [handoffContent,setHandoffContent]= useState("");
  const [activeTab,     setActiveTab]     = useState<ActiveTab>("modules");
  const [logBadge,      setLogBadge]      = useState(0);
  const [newMsgIds,     setNewMsgIds]     = useState<Set<string>>(new Set());
  const [refreshFlash,  setRefreshFlash]  = useState(false);
  const [pullVisible,   setPullVisible]   = useState(false);

  /* ── Refs ── */
  const intervalRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const cdRef           = useRef<ReturnType<typeof setInterval> | null>(null);
  const feedScrollRef   = useRef<HTMLDivElement | null>(null);
  const moduleScrollRef = useRef<HTMLDivElement | null>(null);
  const savedFeedScroll = useRef(0);
  const savedModScroll  = useRef(0);
  const prevMsgIdsRef   = useRef<Set<string>>(new Set());
  const activeTabRef    = useRef<ActiveTab>("modules");
  const kbHandlerRef    = useRef<(e: KeyboardEvent) => void>(() => {});
  const pullRef         = useRef({ startY: 0, pulling: false });
  const fetchAllRef     = useRef<() => Promise<void>>(() => Promise.resolve());

  /* ── Inject CSS ── */
  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = EMPIRE_CSS;
    document.head.appendChild(style);
    return () => document.head.removeChild(style);
  }, []);

  /* ── Derived (memoized) ── */
  const moduleMap     = useMemo(() => buildModuleMap(messages), [messages]);
  const doneCount     = useMemo(() => MODULES.filter(m => deriveModuleStatus(moduleMap[m.num] || []) === "done").length, [moduleMap]);
  const sorted        = useMemo(() => [...messages].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()), [messages]);
  const progressPct   = useMemo(() => Math.round((doneCount / 12) * 100), [doneCount]);
  const newsHeadlines = useMemo(() => generateNewsHeadlines(messages), [messages]);
  const activityLines = useMemo(() => deriveActivityLines(messages), [messages]);
  const hasBlocked    = useMemo(() => sorted.some(m => m.metadata?.status === "blocked"), [sorted]);
  const ctxPct = useMemo(() => {
    const bridgeCtx = sorted.find(m => m.metadata?.task === "chat_context" && m.metadata?.percent != null);
    if (bridgeCtx) return Math.min(100, Math.max(0, Number(bridgeCtx.metadata.percent)));
    const cc = sorted.find(m => m.created_by === "claude_chat" && m.metadata?.conversation_length);
    return cc ? Math.min(100, Math.round((Number(cc.metadata.conversation_length) / 100_000) * 100)) : 0;
  }, [sorted]);

  /* ── Keep activeTabRef current ── */
  useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);

  /* ── Auto-expand building module ── */
  useEffect(() => {
    const building = MODULES.find(m => deriveModuleStatus(moduleMap[m.num] || []) === "building");
    if (building && expandedMod === null) setExpandedMod(building.num);
  }, [messages]);

  /* ── Fetch ── */
  const fetchBridge = useCallback(async (): Promise<BridgeMsg[]> => {
    if (!BRIDGE_TOKEN) { setError("VITE_BRIDGE_READ_TOKEN not set"); return []; }
    setLoading(true); setError(null);
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
        const freshIds = new Set(freshMsgs.filter(m => !prevMsgIdsRef.current.has(m.id)).map(m => m.id));
        if (freshIds.size > 0) {
          setNewMsgIds(freshIds);
          if (activeTabRef.current !== "log") setLogBadge(c => c + freshIds.size);
          setTimeout(() => setNewMsgIds(new Set()), 3000);
        }
        prevMsgIdsRef.current = new Set(freshMsgs.map(m => m.id));
        setMessages(freshMsgs);
      } else { setError(listR.error || "Bridge list failed"); }
      if (usageR.ok) setUsage(usageR.usage);
      return freshMsgs;
    } catch (e: any) { setError(e?.message || "Fetch failed"); return []; }
    finally {
      setLoading(false); setLastFetch(new Date()); setCountdown(20);
      requestAnimationFrame(() => {
        if (feedScrollRef.current)   feedScrollRef.current.scrollTop   = savedFeedScroll.current;
        if (moduleScrollRef.current) moduleScrollRef.current.scrollTop = savedModScroll.current;
      });
    }
  }, []);

  const fetchCosts = useCallback(async () => {
    try {
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
      const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
      const [todayR, monthR] = await Promise.allSettled([
        supabase.from("api_cost_log").select("cost_usd").gte("created_at", todayStart.toISOString()),
        supabase.from("api_cost_log").select("cost_usd").gte("created_at", monthStart.toISOString()),
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
    const gitStatus: HealthState["git"] = gitMsg ? ((Date.now() - new Date(gitMsg.created_at).getTime()) < 2 * 3600 * 1000 ? "synced" : "stale") : "unknown";
    let dbStatus: HealthState["db"] = "unknown";
    try { const { error: e } = await supabase.from("claude_bridge").select("id").limit(1); dbStatus = e ? "error" : "ok"; } catch { dbStatus = "error"; }
    const buildStatus: HealthState["build"] = allSorted[0] ? ((Date.now() - new Date(allSorted[0].created_at).getTime()) < 6 * 3600 * 1000 ? "ok" : "stale") : "unknown";
    setHealth({ ts: tsStatus, git: gitStatus, db: dbStatus, build: buildStatus, ts_sha: tsMsg?.metadata?.sha || "" });
  }, []);

  const fetchAll = useCallback(async () => {
    setRefreshFlash(true);
    const freshMsgs = await fetchBridge();
    await Promise.all([fetchCosts(), freshMsgs.length > 0 ? fetchHealth(freshMsgs) : Promise.resolve()]);
    setTimeout(() => setRefreshFlash(false), 200);
  }, [fetchBridge, fetchCosts, fetchHealth]);

  useEffect(() => { fetchAllRef.current = fetchAll; }, [fetchAll]);

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
      await bridgeCall("post", { kind: "status", title: "PAUSED", body: "PAUSED — King paused the build.", created_by: "claude_code", metadata: { status: "paused", control: true } }, true);
      setIsPaused(true); await fetchAll();
    } finally { setPosting(false); }
  }, [fetchAll]);

  const handleResume = useCallback(async () => {
    if (!BRIDGE_SECRET) { alert("VITE_BRIDGE_SECRET not set"); return; }
    setPosting(true);
    try {
      await bridgeCall("post", { kind: "status", title: "RESUMED", body: "RESUMED — continue build", created_by: "claude_code", metadata: { status: "executing", control: true } }, true);
      setIsPaused(false); await fetchAll();
    } finally { setPosting(false); }
  }, [fetchAll]);

  /* ── Keyboard shortcuts ── */
  kbHandlerRef.current = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    switch (e.key.toLowerCase()) {
      case "r": fetchAll(); break;
      case "p": isPaused ? handleResume() : handlePause(); break;
      case "1": setActiveTab("modules"); break;
      case "2": setActiveTab("active");  break;
      case "3": setActiveTab("log"); setLogBadge(0); break;
      case "4": setActiveTab("health");  break;
      case "escape": setExpandedMod(null); break;
    }
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => kbHandlerRef.current(e);
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  /* ── Pull-to-refresh (active panel only) ── */
  const onActiveTouchStart = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (el.scrollTop === 0) pullRef.current = { startY: e.touches[0].clientY, pulling: true };
  }, []);
  const onActiveTouchMove = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    if (!pullRef.current.pulling) return;
    const dy = e.touches[0].clientY - pullRef.current.startY;
    if (dy > 50) setPullVisible(true);
  }, []);
  const onActiveTouchEnd = useCallback(() => {
    if (pullRef.current.pulling && pullVisible) {
      fetchAllRef.current();
      setTimeout(() => setPullVisible(false), 800);
    }
    pullRef.current.pulling = false;
  }, [pullVisible]);

  /* ── Helpers ── */
  const switchTab = (t: ActiveTab) => { setActiveTab(t); if (t === "log") setLogBadge(0); };

  /* ═══════════════════════════════════════════════════════
     RENDER
  ═══════════════════════════════════════════════════════ */

  /* Panel visibility helper */
  const panel = (tab: ActiveTab): React.CSSProperties => ({
    position: "absolute",
    top: 0, left: 0, right: 0, bottom: 0,
    overflowY: "auto",
    overflowX: "hidden",
    WebkitOverflowScrolling: "touch" as any,
    visibility: activeTab === tab ? "visible" : "hidden",
    pointerEvents: activeTab === tab ? "auto" : "none",
    opacity: refreshFlash && activeTab === tab ? 0.8 : 1,
    transition: "opacity 200ms ease",
  });

  /* ── Fixed Header ── */
  const header = (
    <header style={{
      position: "fixed", top: 0, left: 0, right: 0,
      height: "calc(var(--header-h) + var(--safe-top))",
      paddingTop: "var(--safe-top)",
      paddingLeft: "max(var(--safe-left), 16px)",
      paddingRight: "max(var(--safe-right), 16px)",
      background: "rgba(7,7,16,0.97)",
      backdropFilter: "blur(20px)",
      WebkitBackdropFilter: "blur(20px)",
      borderBottom: "0.5px solid var(--border)",
      zIndex: 100,
      display: "flex", alignItems: "center", justifyContent: "space-between",
      boxSizing: "border-box",
    }}>
      {/* Left */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        <span style={{ fontSize: 18, color: "#f59e0b", flexShrink: 0 }}>👑</span>
        <span style={{ fontSize: isMobile ? 13 : 14, fontWeight: 700, color: "var(--text-1)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {isMobile ? "EMPIRE" : "SEO SEASON — EMPIRE BUILD COMMAND"}
        </span>
        {!isMobile && lastFetch && (
          <span style={{ fontSize: 10, fontFamily: "monospace", color: "var(--text-3)", flexShrink: 0 }}>
            {fmtTime(lastFetch.toISOString())}
          </span>
        )}
        {isDesktop && (
          <span style={{ fontSize: 9, fontFamily: "monospace", color: "var(--text-3)", flexShrink: 0 }}>
            {screen.width}×{screen.height} · {screen.label}
          </span>
        )}
      </div>

      {/* Right */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
        {/* Live dot */}
        <div style={{ display: "flex", alignItems: "center", gap: 4, marginRight: 4 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: error ? "#ef4444" : "#10b981", boxShadow: error ? undefined : "0 0 6px #10b981", animation: error ? undefined : "live-dot 2s infinite" }} />
          {!isMobile && <span style={{ fontSize: 10, fontFamily: "monospace", color: "var(--text-3)" }}>{error ? "ERR" : `${countdown}s`}</span>}
        </div>

        {/* Fresh chat */}
        {ctxPct >= 70 && (
          <button onClick={() => { setHandoffContent(generateHandoff(messages, moduleMap)); setShowFreshChat(true); }}
            style={{ height: 30, padding: "0 10px", background: "rgba(168,85,247,0.15)", border: "1px solid rgba(168,85,247,0.4)", borderRadius: 6, color: "#a855f7", fontSize: 11, fontFamily: "monospace", cursor: "pointer" }}>
            {isMobile ? "🔄" : "🔄 Fresh Chat"}
          </button>
        )}

        {/* Pause/Resume */}
        {isPaused ? (
          <button onClick={handleResume} disabled={posting} style={{ height: 30, padding: "0 10px", background: "rgba(16,185,129,0.15)", border: "1px solid rgba(16,185,129,0.4)", borderRadius: 6, color: "#10b981", fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
            {posting ? <Loader2 size={10} style={{ animation: "ptr-spin 1s linear infinite" }} /> : <Play size={10} />}
            {!isMobile && " Resume"}
          </button>
        ) : (
          <button onClick={handlePause} disabled={posting} style={{ height: 30, padding: "0 10px", background: "rgba(249,115,22,0.12)", border: "1px solid rgba(249,115,22,0.4)", borderRadius: 6, color: "#f97316", fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
            {posting ? <Loader2 size={10} style={{ animation: "ptr-spin 1s linear infinite" }} /> : <Pause size={10} />}
            {!isMobile && " Pause"}
          </button>
        )}

        {/* Refresh */}
        <button onClick={fetchAll} disabled={loading} style={{ width: 44, height: 44, background: "none", border: "none", cursor: "pointer", color: "var(--text-2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          {loading ? <Loader2 size={16} style={{ animation: "ptr-spin 1s linear infinite" }} /> : <RefreshCw size={16} />}
        </button>
      </div>
    </header>
  );

  /* ── Fixed Ticker ── */
  const ticker = (
    <div style={{
      position: "fixed",
      top: "calc(var(--header-h) + var(--safe-top))",
      left: 0, right: 0,
      height: "var(--ticker-h)",
      zIndex: 99, overflow: "hidden",
      background: "rgba(99,102,241,0.07)",
      borderBottom: "0.5px solid rgba(99,102,241,0.2)",
      display: "flex", alignItems: "center",
    }}>
      {/* Fade edges */}
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 48, zIndex: 2, background: "linear-gradient(to right,#070710,transparent)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 48, zIndex: 2, background: "linear-gradient(to left,#070710,transparent)", pointerEvents: "none" }} />

      <div
        style={{ display: "inline-flex", alignItems: "center", whiteSpace: "nowrap", fontSize: 12, fontWeight: 500, color: "#a5b4fc", animation: "ticker-scroll 80s linear infinite", paddingLeft: 20 }}
        onMouseEnter={e => (e.currentTarget.style.animationPlayState = "paused")}
        onMouseLeave={e => (e.currentTarget.style.animationPlayState = "running")}
      >
        {[0, 1].map(copy => newsHeadlines.map((h, i) => (
          <React.Fragment key={`${copy}-${i}`}>
            <span>{h}</span>
            <span style={{ color: "#6366f1", fontSize: 14, padding: "0 16px" }}>✦</span>
          </React.Fragment>
        )))}
      </div>
    </div>
  );

  /* ── Pause banner ── */
  const pauseBanner = isPaused ? (
    <div style={{ position: "fixed", top: "calc(var(--chrome-h) + var(--safe-top))", left: isDesktop ? "var(--sidebar-w)" : 0, right: isWide ? "var(--aside-w)" : 0, zIndex: 90, padding: "8px 16px", textAlign: "center", fontSize: 12, fontFamily: "monospace", fontWeight: 700, color: "#f97316", background: "rgba(249,115,22,0.15)", borderBottom: "1px solid rgba(249,115,22,0.3)" }}>
      ⏸ BUILD PAUSED — waiting for RESUME
    </div>
  ) : null;

  /* ── Fixed Sidebar (desktop >= 1024px) ── */
  const sidebar = isDesktop ? (
    <aside style={{
      position: "fixed", top: 0, left: "var(--safe-left)", bottom: 0,
      width: "var(--sidebar-w)",
      background: "#0a0a16",
      borderRight: "0.5px solid var(--border)",
      zIndex: 50, display: "flex", flexDirection: "column",
      overflowY: "auto", overflowX: "hidden",
    }}>
      {/* Sidebar header — below the global header */}
      <div style={{ paddingTop: "calc(var(--header-h) + var(--ticker-h) + var(--safe-top) + 20px)", paddingLeft: 16, paddingRight: 16, paddingBottom: 16, borderBottom: "0.5px solid var(--border)", flexShrink: 0 }}>
        <div style={{ fontSize: 17, fontWeight: 700, color: "var(--text-1)", lineHeight: 1.2 }}>👑 SEO SEASON</div>
        <div style={{ fontSize: 10, color: "var(--text-3)", letterSpacing: "2px", marginTop: 2 }}>EMPIRE BUILD</div>
        {/* Progress bar */}
        <div style={{ marginTop: 12, height: 6, borderRadius: 3, background: "#1e1e3a", overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${progressPct}%`, background: "linear-gradient(90deg,#6366f1,#10b981)", borderRadius: 3, transition: "width 0.6s ease" }} />
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4, fontSize: 11, color: "var(--text-3)" }}>
          {doneCount}/12 complete
        </div>
      </div>

      {/* Module list */}
      <div ref={moduleScrollRef} style={{ flex: 1, overflowY: "auto", padding: "12px 8px" }}>
        {MODULES.map(mod => (
          <ModuleCard
            key={mod.num}
            mod={mod}
            msgs={moduleMap[mod.num] || []}
            expanded={expandedMod === mod.num}
            onToggle={() => setExpandedMod(v => v === mod.num ? null : mod.num)}
          />
        ))}
      </div>

      {/* Sidebar footer — health */}
      <div style={{ padding: "12px 16px", borderTop: "0.5px solid var(--border)", flexShrink: 0 }}>
        <div style={{ fontSize: 9, letterSpacing: "1px", color: "var(--text-3)", marginBottom: 6 }}>SYSTEM HEALTH</div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {[
            { label: "TS",    ok: health.ts    !== "errors", val: health.ts    === "clean"  ? "✓" : health.ts    === "errors" ? "✗" : "?" },
            { label: "Git",   ok: health.git   !== "stale",  val: health.git   === "synced" ? "✓" : health.git  === "stale"  ? "⚠" : "?" },
            { label: "DB",    ok: health.db    !== "error",  val: health.db    === "ok"     ? "✓" : health.db   === "error"  ? "✗" : "?" },
            { label: "Build", ok: health.build !== "stale",  val: health.build === "ok"     ? "✓" : health.build === "stale" ? "⚠" : "?" },
          ].map(h => (
            <div key={h.label} style={{ display: "flex", alignItems: "center", gap: 3 }}>
              <span style={{ fontSize: 10, color: "var(--text-3)" }}>{h.label}</span>
              <span style={{ fontSize: 10, color: h.ok ? "#10b981" : "#ef4444" }}>{h.val}</span>
            </div>
          ))}
        </div>
        {error && <div style={{ marginTop: 8, fontSize: 10, color: "#ef4444", fontFamily: "monospace" }}>⚠ {error.slice(0, 60)}</div>}
        {lastFetch && <div style={{ marginTop: 4, fontSize: 9, fontFamily: "monospace", color: "var(--text-3)" }}>Synced {fmtRelative(lastFetch.toISOString())}</div>}
      </div>
    </aside>
  ) : null;

  /* ── Fixed content area ── */
  const contentTop = isPaused
    ? "calc(var(--chrome-h) + var(--safe-top) + 37px)"
    : "calc(var(--chrome-h) + var(--safe-top))";

  const contentStyle: React.CSSProperties = {
    position: "fixed",
    top: contentTop,
    bottom: isMobile ? "calc(var(--nav-h) + var(--safe-bottom))" : 0,
    left:  isDesktop ? "var(--sidebar-w)" : 0,
    right: isWide    ? "var(--aside-w)"   : 0,
    overflow: "hidden",
    background: "var(--void)",
  };

  /* ── MODULES panel ── */
  const modulesPanel = (
    <div style={panel("modules")}>
      <div style={{ padding: "16px 12px 24px" }}>
        {/* Progress header (mobile only — sidebar shows it on desktop) */}
        {isMobile && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontSize: 11, letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--text-3)" }}>EMPIRE MODULES</span>
              <span style={{ fontSize: 11, color: "var(--text-3)" }}>{doneCount}/12 · {progressPct}%</span>
            </div>
            <div style={{ height: 6, borderRadius: 3, background: "#1e1e3a", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${progressPct}%`, background: "linear-gradient(90deg,#6366f1,#10b981)", borderRadius: 3, transition: "width 0.6s ease" }} />
            </div>
          </div>
        )}
        {MODULES.map(mod => (
          <ModuleCard
            key={mod.num}
            mod={mod}
            msgs={moduleMap[mod.num] || []}
            expanded={expandedMod === mod.num}
            onToggle={() => setExpandedMod(v => v === mod.num ? null : mod.num)}
          />
        ))}
      </div>
    </div>
  );

  /* ── ACTIVE panel ── */
  const activeLastDone = useMemo(
    () => sorted.find(m => m.metadata?.status === "done" || /MODULE_\d+_DONE/i.test(m.title || "") || m.metadata?.module_done) ?? null,
    [sorted]
  );

  const activePanel = (
    <div
      style={panel("active")}
      onTouchStart={onActiveTouchStart}
      onTouchMove={onActiveTouchMove}
      onTouchEnd={onActiveTouchEnd}
    >
      {/* Pull indicator */}
      {pullVisible && (
        <div style={{ position: "absolute", top: 8, left: "50%", transform: "translateX(-50%)", zIndex: 10, fontSize: 24, animation: "ptr-spin 0.6s linear infinite" }}>👑</div>
      )}

      <div style={{ padding: "16px 12px" }}>
        <ActiveHeroCard msgs={sorted} lastDone={activeLastDone} />

        {/* Live activity */}
        {activityLines.length > 0 && (
          <div style={{ borderRadius: 14, border: "0.5px solid var(--border)", background: "var(--surface)", overflow: "hidden" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", borderBottom: "0.5px solid var(--border-dim)" }}>
              <span style={{ fontSize: 10, letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--text-3)" }}>LIVE ACTIVITY</span>
              <span style={{ fontSize: 11, color: "#10b981", display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#10b981", animation: "live-dot 1.5s infinite", display: "inline-block" }} />
                LIVE
              </span>
            </div>
            {activityLines.map((line, i) => (
              <div key={line.id} style={{ display: "grid", gridTemplateColumns: "48px 20px 1fr", gap: 8, padding: "10px 14px", minHeight: 44, alignItems: "start", borderBottom: "0.5px solid #0f0f1e", animation: "activity-in 300ms ease forwards", animationDelay: `${i * 30}ms`, opacity: 0 }}>
                <span style={{ fontSize: 10, fontFamily: "monospace", color: "var(--text-3)" }}>{fmtRelative(line.time).replace(" ago", "")}</span>
                <span style={{ fontSize: 13, color: line.color }}>{line.icon}</span>
                <span style={{ fontSize: 12, color: "var(--text-2)", lineHeight: 1.5 }}>{line.text}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  /* ── LOG panel ── */
  const logPanel = (
    <div style={panel("log")} ref={feedScrollRef}>
      <div style={{ padding: "12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <Radio size={12} style={{ color: "#6366f1" }} />
          <span style={{ fontSize: 10, fontFamily: "monospace", fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--text-3)" }}>BUILD LOG</span>
          <span style={{ fontSize: 9, fontFamily: "monospace", padding: "1px 6px", borderRadius: 10, background: "rgba(99,102,241,0.15)", color: "#6366f1" }}>{sorted.length}</span>
        </div>
        {sorted.length === 0 && !loading && (
          <div style={{ textAlign: "center", padding: "48px 16px", color: "var(--text-3)" }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>📭</div>
            <div style={{ fontSize: 13 }}>No messages yet</div>
          </div>
        )}
        {sorted.map(msg => (
          <FeedEntry key={msg.id} msg={msg} isNew={newMsgIds.has(msg.id)} />
        ))}
      </div>
    </div>
  );

  /* ── HEALTH panel ── */
  const tokenPct   = usage ? Math.min(100, Math.round((usage.tokens_today / SESSION_TOKEN_BUDGET) * 100)) : 0;
  const tokenColor = tokenPct >= 90 ? "#ef4444" : tokenPct >= 70 ? "#eab308" : "#10b981";
  const chatInstr  = sorted.find(m => m.created_by === "claude_chat" && m.kind === "instruction") || null;

  const healthPanel = (
    <div style={panel("health")}>
      <div style={{ padding: "16px 12px" }}>
        {/* System — full width */}
        <div style={{ gridColumn: "1 / -1", borderRadius: 14, border: "0.5px solid var(--border)", background: "var(--surface)", padding: 14, marginBottom: 10 }}>
          <div style={{ fontSize: 10, letterSpacing: "1px", color: "var(--text-3)", marginBottom: 10 }}>SYSTEM HEALTH</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {[
              { label: "TypeScript", ok: health.ts    !== "errors", val: health.ts    === "clean"  ? "✅ CLEAN"  : health.ts    === "errors" ? "❌ ERRORS" : "—" },
              { label: "Git",        ok: health.git   !== "stale",  val: health.git   === "synced" ? "✅ SYNCED" : health.git  === "stale"  ? "⚠ STALE"  : "—" },
              { label: "Database",   ok: health.db    !== "error",  val: health.db    === "ok"     ? "✅ OK"     : health.db   === "error"  ? "❌ ERROR"  : "—" },
              { label: "Bridge",     ok: health.build !== "stale",  val: health.build === "ok"     ? "✅ ACTIVE" : health.build === "stale" ? "⚠ STALE"  : "—" },
            ].map(h => (
              <div key={h.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "0.5px solid var(--border-dim)" }}>
                <span style={{ fontSize: 11, color: "var(--text-3)" }}>{h.label}</span>
                <span style={{ fontSize: 10, fontFamily: "monospace", color: h.ok ? "#10b981" : "#ef4444" }}>{h.val}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 2-col grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
          {/* Today */}
          <div style={{ borderRadius: 14, border: "0.5px solid var(--border)", background: "var(--surface)", padding: 14 }}>
            <div style={{ fontSize: 10, letterSpacing: "1px", color: "var(--text-3)", marginBottom: 8 }}>TODAY</div>
            <div style={{ fontSize: "clamp(20px,5vw,26px)", fontWeight: 700, color: "var(--text-1)", marginBottom: 4 }}>{usage?.completed_today ?? "—"}</div>
            <div style={{ fontSize: 10, color: "var(--text-3)", marginBottom: 8 }}>tasks done</div>
            <div style={{ fontSize: 12, color: tokenColor, marginBottom: 4 }}>~{usage ? fmtTokens(usage.tokens_today) : "—"} tok</div>
            <div style={{ height: 4, borderRadius: 2, background: "#1e1e3a", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${tokenPct}%`, background: `linear-gradient(90deg,#6366f1,${tokenColor})`, borderRadius: 2, transition: "width 0.6s ease" }} />
            </div>
          </div>

          {/* Month */}
          <div style={{ borderRadius: 14, border: "0.5px solid var(--border)", background: "var(--surface)", padding: 14 }}>
            <div style={{ fontSize: 10, letterSpacing: "1px", color: "var(--text-3)", marginBottom: 8 }}>THIS MONTH</div>
            <div style={{ fontSize: "clamp(20px,5vw,26px)", fontWeight: 700, color: "#f97316", marginBottom: 4 }}>
              {cost?.month_usd != null ? `$${cost.month_usd.toFixed(2)}` : usage?.month_cost_usd != null ? `$${usage.month_cost_usd.toFixed(2)}` : "—"}
            </div>
            <div style={{ fontSize: 10, color: "var(--text-3)", marginBottom: 8 }}>API spend</div>
            <div style={{ fontSize: 12, color: "var(--text-2)" }}>{cost?.month_tasks ?? usage?.total_messages ?? "—"} tasks</div>
            <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 8 }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#10b981", boxShadow: "0 0 4px #10b981" }} />
              <span style={{ fontSize: 9, color: "var(--text-3)" }}>Budget normal</span>
            </div>
          </div>
        </div>

        {/* Claude Chat */}
        <div style={{ borderRadius: 14, border: "0.5px solid var(--border)", background: "var(--surface)", padding: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
            <MessageSquare size={11} style={{ color: "#a855f7" }} />
            <span style={{ fontSize: 10, letterSpacing: "1px", color: "var(--text-3)" }}>CLAUDE CHAT</span>
          </div>
          {chatInstr ? (
            <>
              <p style={{ fontSize: 11, fontFamily: "monospace", color: "#9090b8", lineHeight: 1.5, margin: "0 0 8px" }}>
                &ldquo;{(chatInstr.body || chatInstr.title || "").slice(0, 120)}&rdquo;
              </p>
              <span style={{ fontSize: 10, color: "var(--text-3)" }}>{fmtRelative(chatInstr.created_at)}</span>
              {(chatInstr.metadata?.module_num || chatInstr.metadata?.task) && (
                <div style={{ fontSize: 10, color: "#4444aa", marginTop: 4 }}>
                  Waiting for: Module {chatInstr.metadata?.module_num ? String(chatInstr.metadata.module_num).padStart(2,"0") : "?"}{chatInstr.metadata?.task ? ` · Task ${chatInstr.metadata.task}` : ""} completion
                </div>
              )}
            </>
          ) : (
            <p style={{ fontSize: 11, fontFamily: "monospace", color: "var(--text-3)", margin: 0 }}>Waiting for instruction</p>
          )}
        </div>
      </div>
    </div>
  );

  /* ── Fixed Bottom Nav (mobile < 1024px) ── */
  const NAV_TABS: { id: ActiveTab; emoji: string; label: string }[] = [
    { id: "modules", emoji: "⬡", label: "MODULES" },
    { id: "active",  emoji: "⚡", label: "ACTIVE"  },
    { id: "log",     emoji: "📋", label: "LOG"     },
    { id: "health",  emoji: "♥",  label: "HEALTH"  },
  ];
  const activeNavIdx = NAV_TABS.findIndex(t => t.id === activeTab);

  const bottomNav = isMobile ? (
    <nav style={{
      position: "fixed", bottom: 0, left: 0, right: 0,
      height: "calc(var(--nav-h) + var(--safe-bottom))",
      paddingBottom: "var(--safe-bottom)",
      background: "rgba(7,7,16,0.97)",
      backdropFilter: "blur(20px)",
      WebkitBackdropFilter: "blur(20px)",
      borderTop: "0.5px solid var(--border)",
      zIndex: 100, display: "flex", alignItems: "flex-start",
      paddingTop: 8,
    }}>
      {NAV_TABS.map((t, i) => {
        const isActive = t.id === activeTab;
        return (
          <button key={t.id} onClick={() => switchTab(t.id)}
            style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "4px 0", minHeight: 44, border: "none", background: "none", cursor: "pointer", position: "relative" }}>
            {/* Active indicator bar */}
            {isActive && (
              <div style={{ position: "absolute", top: 0, width: 24, height: 3, borderRadius: "0 0 3px 3px", background: "#6366f1" }} />
            )}
            {/* Notification dot */}
            {t.id === "log" && logBadge > 0 && (
              <div style={{ position: "absolute", top: 4, right: "calc(50% - 18px)", width: 16, height: 16, borderRadius: "50%", background: "#ef4444", color: "#fff", fontSize: 8, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {logBadge > 9 ? "9+" : logBadge}
              </div>
            )}
            {t.id === "modules" && hasBlocked && (
              <div style={{ position: "absolute", top: 4, right: "calc(50% - 18px)", width: 8, height: 8, borderRadius: "50%", background: "#ef4444" }} />
            )}
            <span style={{ fontSize: 20, filter: isActive ? "drop-shadow(0 0 4px #6366f1)" : undefined, opacity: isActive ? 1 : 0.4, lineHeight: 1 }}>{t.emoji}</span>
            {isActive && <span style={{ fontSize: 9, fontFamily: "monospace", color: "#818cf8", letterSpacing: "0.5px" }}>{t.label}</span>}
          </button>
        );
      })}
    </nav>
  ) : null;

  /* ── Fixed Right Aside (wide >= 1440px) ── */
  const aside = isWide ? (
    <aside style={{
      position: "fixed",
      top: "calc(var(--chrome-h) + var(--safe-top))",
      right: "var(--safe-right)",
      bottom: 0,
      width: "var(--aside-w)",
      background: "#080812",
      borderLeft: "0.5px solid var(--border)",
      zIndex: 50,
      overflowY: "auto", overflowX: "hidden",
      padding: 16,
    }}>
      {/* Claude Chat */}
      <div style={{ borderRadius: 12, border: "0.5px solid var(--border)", background: "var(--surface)", padding: 14, marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
          <MessageSquare size={11} style={{ color: "#a855f7" }} />
          <span style={{ fontSize: 10, letterSpacing: "1px", color: "var(--text-3)" }}>CLAUDE CHAT</span>
        </div>
        {chatInstr ? (
          <>
            <p style={{ fontSize: 11, fontFamily: "monospace", color: "#9090b8", lineHeight: 1.5, margin: "0 0 6px" }}>
              &ldquo;{(chatInstr.body || chatInstr.title || "").slice(0, 100)}&rdquo;
            </p>
            <span style={{ fontSize: 10, color: "var(--text-3)" }}>{fmtRelative(chatInstr.created_at)}</span>
          </>
        ) : (
          <p style={{ fontSize: 11, color: "var(--text-3)", margin: 0 }}>Waiting for instruction</p>
        )}
      </div>

      {/* Today + Month */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
        <div style={{ borderRadius: 12, border: "0.5px solid var(--border)", background: "var(--surface)", padding: 12 }}>
          <div style={{ fontSize: 9, color: "var(--text-3)", marginBottom: 6 }}>TODAY</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "var(--text-1)" }}>{usage?.completed_today ?? "—"}</div>
          <div style={{ fontSize: 10, color: tokenColor }}>~{usage ? fmtTokens(usage.tokens_today) : "—"} tok</div>
        </div>
        <div style={{ borderRadius: 12, border: "0.5px solid var(--border)", background: "var(--surface)", padding: 12 }}>
          <div style={{ fontSize: 9, color: "var(--text-3)", marginBottom: 6 }}>MONTH</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#f97316" }}>
            {cost?.month_usd != null ? `$${cost.month_usd.toFixed(2)}` : "—"}
          </div>
          <div style={{ fontSize: 10, color: "var(--text-3)" }}>{cost?.month_tasks ?? "—"} tasks</div>
        </div>
      </div>

      {/* System health */}
      <div style={{ borderRadius: 12, border: "0.5px solid var(--border)", background: "var(--surface)", padding: 14, marginBottom: 12 }}>
        <div style={{ fontSize: 10, letterSpacing: "1px", color: "var(--text-3)", marginBottom: 8 }}>SYSTEM HEALTH</div>
        {[
          { label: "TypeScript", ok: health.ts    !== "errors", val: health.ts    === "clean"  ? "✅ CLEAN"  : health.ts    === "errors" ? "❌ ERRORS" : "—" },
          { label: "Git",        ok: health.git   !== "stale",  val: health.git   === "synced" ? "✅ SYNCED" : "⚠ STALE" },
          { label: "Database",   ok: health.db    !== "error",  val: health.db    === "ok"     ? "✅ OK"     : "❌ ERROR" },
          { label: "Bridge",     ok: health.build !== "stale",  val: health.build === "ok"     ? "✅ ACTIVE" : "⚠ STALE" },
        ].map(h => (
          <div key={h.label} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "0.5px solid var(--border-dim)" }}>
            <span style={{ fontSize: 11, color: "var(--text-3)" }}>{h.label}</span>
            <span style={{ fontSize: 10, color: h.ok ? "#10b981" : "#ef4444" }}>{h.val}</span>
          </div>
        ))}
      </div>

      {/* Recent log entries */}
      <div style={{ fontSize: 10, letterSpacing: "1px", color: "var(--text-3)", marginBottom: 8 }}>RECENT LOG</div>
      {sorted.slice(0, 5).map(msg => (
        <div key={msg.id} style={{ padding: "8px 10px", borderRadius: 8, border: "0.5px solid var(--border)", background: "var(--void)", marginBottom: 6 }}>
          <div style={{ fontSize: 9, fontFamily: "monospace", color: "#6366f1", marginBottom: 3 }}>{msg.kind} · {fmtRelative(msg.created_at)}</div>
          <div style={{ fontSize: 11, color: "var(--text-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{msg.title || msg.body?.slice(0, 60)}</div>
        </div>
      ))}
    </aside>
  ) : null;

  /* ── Final render ── */
  return (
    <div style={{ background: "var(--void)", minHeight: "100dvh", fontFamily: "system-ui, -apple-system, sans-serif", color: "var(--text-1)" }}>
      {header}
      {ticker}
      {pauseBanner}
      {sidebar}
      {aside}

      {/* Content area — all 4 panels mounted simultaneously */}
      <div style={contentStyle}>
        {modulesPanel}
        {activePanel}
        {logPanel}
        {healthPanel}
      </div>

      {bottomNav}
      {showFreshChat && <FreshChatModal content={handoffContent} onClose={() => setShowFreshChat(false)} />}
    </div>
  );
}
