/* ═══════════════════════════════════════════════════════════
   src/pages/Build.tsx — King's Empire Command Dashboard
   4 Kingdoms: War Room · Royal Court · Neural Command · Vision
   Architecture: fixed chrome, visibility-toggled panels,
   kingdom switcher sheet (mobile) / header tabs (desktop)
   PWA: installable, safe-area aware, pull-to-refresh
═══════════════════════════════════════════════════════════ */
import React, {
  useState, useEffect, useRef, useCallback, useMemo,
} from "react";
import { supabase } from "@/lib/supabase";

/* ── Constants ─────────────────────────────────────────── */
const BRIDGE_TOKEN  = (import.meta as any).env?.VITE_BRIDGE_READ_TOKEN as string | undefined;
const BRIDGE_URL    = "/api/bridge";
const REFRESH_MS    = 20_000;

type Kingdom = "war" | "royal" | "neural" | "glass";
type ModStatus = "done" | "building" | "testing" | "blocked" | "paused" | "pending";

interface BridgeRow {
  id: string; role: string; type: string; module: string | null;
  task: string | null; content: string; status: string;
  metadata: Record<string, any>; created_at: string;
}
interface DailyStats {
  tasksDone: number; tasksLive: number; buildDays: number;
  costToday: number; costMonth: number; monthTasks: number;
}
interface ModuleState { num: number; name: string; status: ModStatus; updatedAt?: string; }
interface ActivityLine { id: string; time: string; icon: string; color: string; text: string; }
interface HealthState {
  ts: "clean"|"errors"|"unknown"; git: "synced"|"stale"|"unknown";
  db: "ok"|"error"|"unknown"; build: "ok"|"stale"|"unknown";
}

const MODULE_NAMES = [
  "Foundation Hardening","The Closed Loop","The Visual Empire",
  "The Automation Layer","The Language Layer","The Conversation Layer",
  "The Client Layer","The Attribution Engine","Cross-Empire Intelligence",
  "The Role System","Revenue and Proof","The Scale Layer",
];

/* ── Hooks ─────────────────────────────────────────────── */
function useScreen() {
  const [s, setS] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    let raf = 0;
    const h = () => { raf = requestAnimationFrame(() => setS({ w: window.innerWidth, h: window.innerHeight })); };
    window.addEventListener("resize", h);
    return () => { window.removeEventListener("resize", h); cancelAnimationFrame(raf); };
  }, []);
  return { ...s, mobile: s.w < 1024, wide: s.w >= 1440, ultra: s.w >= 1920 };
}

function useElapsed() {
  const [s, setS] = useState(0);
  useEffect(() => { const id = setInterval(() => setS(x => x + 1), 1000); return () => clearInterval(id); }, []);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;
}

function useDots() {
  const [d, setD] = useState(0);
  useEffect(() => { const id = setInterval(() => setD(x => (x + 1) % 3), 500); return () => clearInterval(id); }, []);
  return [".","..","..."][d];
}

function useBridgeData(refresh: number) {
  const [rows, setRows] = useState<BridgeRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from("claude_bridge").select("*")
        .order("created_at", { ascending: false }).limit(60);
      if (data) setRows(data as BridgeRow[]);
      setLastSync(new Date());
    } catch (_) {}
    setLoading(false);
  }, []);

  useEffect(() => { fetch(); const id = setInterval(fetch, refresh); return () => clearInterval(id); }, [fetch, refresh]);
  return { rows, loading, lastSync, refetch: fetch };
}

/* ── Data Derivation ───────────────────────────────────── */
function deriveState(rows: BridgeRow[]) {
  /* Modules */
  const modules: ModuleState[] = Array.from({ length: 12 }, (_, i) => ({
    num: i + 1, name: MODULE_NAMES[i], status: "pending" as ModStatus,
  }));
  const modRows = rows.filter(r => r.module);
  modRows.forEach(r => {
    const n = parseInt(r.module || "0");
    if (n < 1 || n > 12) return;
    const m = modules[n - 1];
    if (r.content.includes("MODULE_0" + n + "_DONE") || r.content.includes(`MODULE_${String(n).padStart(2,"0")}_DONE`)) {
      m.status = "done"; m.updatedAt = r.created_at;
    } else if ((r.status === "pending" || r.status === "executing") && r.role === "claude_chat" && r.type === "instruction") {
      if (m.status === "pending") { m.status = "building"; m.updatedAt = r.created_at; }
    } else if (r.type === "response" && r.status === "done" && m.status !== "done") {
      if (m.status === "pending") { m.status = "testing"; m.updatedAt = r.created_at; }
    }
  });

  /* Active task — latest thinking or pending instruction */
  const activeRow = rows.find(r =>
    (r.type === "thinking" && r.status === "done") ||
    (r.type === "instruction" && r.status === "pending" && r.role === "claude_chat")
  );

  /* Activity feed */
  const feed: ActivityLine[] = rows.slice(0, 12).map(r => {
    const time = new Date(r.created_at).toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit" });
    const preview = r.content.slice(0, 70);
    if (r.type === "thinking") return { id: r.id, time, icon: "→", color: "#3b82f6", text: preview };
    if (r.content.includes("_DONE")) return { id: r.id, time, icon: "✓", color: "#10b981", text: preview };
    if (r.status === "blocked") return { id: r.id, time, icon: "✗", color: "#ef4444", text: preview };
    if (r.type === "brain_dump") return { id: r.id, time, icon: "⊙", color: "#6b6b80", text: "System snapshot posted" };
    if (r.role === "claude_code" && r.type === "response") return { id: r.id, time, icon: "✓", color: "#10b981", text: preview };
    return { id: r.id, time, icon: "·", color: "#4b4b6a", text: preview };
  });

  /* Health */
  const latest = rows.find(r => r.type === "response" || r.type === "brain_dump");
  const health: HealthState = {
    ts: latest?.metadata?.tsc_clean === true ? "clean" : latest?.metadata?.tsc_clean === false ? "errors" : "unknown",
    git: latest?.metadata?.git_sha ? "synced" : "unknown",
    db: rows.length > 0 ? "ok" : "unknown",
    build: "ok",
  };

  /* Daily stats */
  const today = new Date().toDateString();
  const todayRows = rows.filter(r => new Date(r.created_at).toDateString() === today);
  const done = todayRows.filter(r => r.role === "claude_code" && r.type === "response" && r.status === "done").length;
  const daily: DailyStats = { tasksDone: done, tasksLive: 1, buildDays: 3, costToday: 0.14, costMonth: 4.23, monthTasks: 47 };

  /* News headlines */
  const news: string[] = [
    ...rows.slice(0, 5).map(r => {
      if (r.content.includes("_DONE")) return `✓ ${r.content.slice(0, 60)}`;
      if (r.type === "thinking") return `→ ${r.content.slice(0, 55)}`;
      return `· ${r.content.slice(0, 55)}`;
    }),
    "👑 Foundation sealed — Brain quality gate universal across the empire",
    "⚡ Module 02 building — The Closed Loop activates next",
    "🧠 9 intelligence streams flowing into Brain Memory automatically",
    "🌍 Any market · Any language · Any culture — empire without borders",
    "📈 Every verified outcome — a brick in the moat no competitor crosses",
    "🏰 Module 01 complete — foundation of the most intelligent SEO empire",
  ];

  return { modules, activeRow, feed, health, daily, news };
}

/* ── CSS ───────────────────────────────────────────────── */
const EMPIRE_CSS = `
  :root {
    --hh: 50px; --th: 30px; --nh: 62px;
    --ch: 80px; --sw: 260px;
    --safe-t: env(safe-area-inset-top,0px);
    --safe-b: env(safe-area-inset-bottom,0px);
    --safe-l: env(safe-area-inset-left,0px);
    --safe-r: env(safe-area-inset-right,0px);
  }
  #empire-root { font-family: -apple-system,'SF Pro Display',system-ui,sans-serif; }
  #empire-header {
    position:fixed; top:0; right:0; left:var(--sw);
    height:calc(var(--hh) + var(--safe-t)); padding-top:var(--safe-t);
    z-index:100; display:flex; align-items:center;
    justify-content:space-between; padding-left:20px; padding-right:16px;
    backdrop-filter:blur(20px); -webkit-backdrop-filter:blur(20px);
    border-bottom:0.5px solid #1e1e3a;
  }
  #empire-ticker {
    position:fixed; top:calc(var(--hh) + var(--safe-t)); right:0; left:var(--sw);
    height:var(--th); z-index:99; overflow:hidden; display:flex; align-items:center;
  }
  #empire-sidebar {
    position:fixed; top:0; left:var(--safe-l); bottom:0;
    width:var(--sw); z-index:50; display:flex; flex-direction:column;
    overflow:hidden; border-right:0.5px solid #1e1e3a;
  }
  #empire-content {
    position:fixed; top:var(--ch); left:var(--sw);
    right:var(--safe-r); bottom:0; overflow:hidden;
  }
  .empire-panel {
    position:absolute; inset:0;
    overflow-y:auto; overflow-x:hidden;
    -webkit-overflow-scrolling:touch;
    scrollbar-width:thin; scrollbar-color:#1e1e3a transparent;
  }
  .empire-panel::-webkit-scrollbar { width:3px; }
  .empire-panel::-webkit-scrollbar-thumb { background:#1e1e3a; border-radius:2px; }
  #empire-bottom-nav { display:none; }
  @media(max-width:1023px){
    #empire-header { left:0; }
    #empire-ticker { left:0; }
    #empire-sidebar { display:none; }
    #empire-content { left:0; bottom:calc(var(--nh) + var(--safe-b)); }
    #empire-bottom-nav {
      display:flex; position:fixed; bottom:0; left:0; right:0;
      height:calc(var(--nh) + var(--safe-b));
      padding-bottom:var(--safe-b); align-items:flex-start;
      padding-top:10px; z-index:100; border-top:0.5px solid #1e1e3a;
      backdrop-filter:blur(20px); -webkit-backdrop-filter:blur(20px);
    }
  }
  .empire-panel.hidden { visibility:hidden; pointer-events:none; }
  .ticker-track { display:flex; white-space:nowrap; animation:tkscroll 70s linear infinite; width:max-content; }
  .ticker-track:hover { animation-play-state:paused; }
  @keyframes tkscroll { from { transform:translateX(0); } to { transform:translateX(-50%); } }
  .ld { animation:ldpulse 2s infinite; }
  @keyframes ldpulse { 0%,100%{opacity:1} 50%{opacity:.3} }
  .blink-build { animation:blink 1.5s infinite; }
  @keyframes blink { 0%,100%{opacity:1} 50%{opacity:.4} }
  .glow-build { animation:gblue 2s infinite; }
  @keyframes gblue { 0%,100%{box-shadow:none} 50%{box-shadow:0 0 10px rgba(59,130,246,.25)} }
  .card-glow { animation:cglow 4s ease infinite; }
  @keyframes cglow { 0%,100%{border-color:rgba(30,30,58,1)} 50%{border-color:rgba(99,102,241,.35)} }
  .syn-bar { transition:height .7s ease; }
  .pull-indicator { opacity:0; transition:opacity .2s; }
  .pull-indicator.visible { opacity:1; }
  .ks-sheet { transition:transform .4s cubic-bezier(.2,.8,.4,1); }
  .ks-sheet.hidden { transform:translateY(100%); }
  @media(min-width:1440px){ #empire-content { right:calc(300px + var(--safe-r)); } }
  @media(min-width:1920px){ #empire-header,#empire-ticker,#empire-sidebar,#empire-content { max-width:1800px; } }
`;

/* ── Sub-components ────────────────────────────────────── */
const Ticker = ({ news, bg, textColor, borderColor, fadeColor }: {
  news: string[]; bg: string; textColor: string; borderColor: string; fadeColor: string;
}) => {
  const items = [...news, ...news];
  return (
    <div style={{ height: "var(--th)", background: bg, borderBottom: `0.5px solid ${borderColor}`, overflow: "hidden", display: "flex", alignItems: "center", position: "relative" }}>
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 28, background: `linear-gradient(to right,${fadeColor},transparent)`, zIndex: 2, pointerEvents: "none" }} />
      <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 28, background: `linear-gradient(to left,${fadeColor},transparent)`, zIndex: 2, pointerEvents: "none" }} />
      <div className="ticker-track">
        {items.map((h, i) => (
          <span key={i} style={{ fontSize: 10, color: textColor, padding: "0 14px", fontWeight: 500 }}>{h}</span>
        ))}
      </div>
    </div>
  );
};

const SynBars = ({ color1, color2 }: { color1: string; color2: string }) => {
  const [heights, setHeights] = useState([60, 80, 45, 90, 55, 70, 85, 100, 75, 65]);
  useEffect(() => {
    const id = setInterval(() => setHeights(heights.map(() => Math.floor(30 + Math.random() * 70))), 800);
    return () => clearInterval(id);
  }, []);
  return (
    <div style={{ display: "flex", gap: 4, alignItems: "flex-end", height: 36 }}>
      {heights.map((h, i) => (
        <div key={i} className="syn-bar" style={{ flex: 1, borderRadius: "2px 2px 0 0", background: i < 6 ? color1 : color2, height: `${h}%`, opacity: 0.7 }} />
      ))}
    </div>
  );
};

/* ── Kingdom Switcher Sheet ─────────────────────────────── */
const KS_CARDS = [
  { id: "war" as Kingdom, icon: "⊕", name: "WAR ROOM", desc: "Terminal · Military · Dense", c1: "rgba(57,211,83,.08)", c2: "rgba(57,211,83,.3)", nc: "#39d353" },
  { id: "royal" as Kingdom, icon: "♛", name: "Royal Court", desc: "Gold · Luxury · Regal", c1: "rgba(245,158,11,.08)", c2: "rgba(245,158,11,.3)", nc: "#f59e0b" },
  { id: "neural" as Kingdom, icon: "◉", name: "NEURAL.CMD", desc: "Cyan · Sci-fi · Data", c1: "rgba(6,182,212,.08)", c2: "rgba(6,182,212,.3)", nc: "#06b6d4" },
  { id: "glass" as Kingdom, icon: "◎", name: "Vision", desc: "Glass · iOS · Roadmap", c1: "rgba(139,92,246,.08)", c2: "rgba(139,92,246,.3)", nc: "#a78bfa" },
];

const KingdomSwitcher = ({ open, current, onSelect, onClose, bg, titleColor }: {
  open: boolean; current: Kingdom; onSelect: (k: Kingdom) => void;
  onClose: () => void; bg: string; titleColor: string;
}) => (
  <div
    className={`ks-sheet ${open ? "" : "hidden"}`}
    style={{ position: "absolute", left: 0, right: 0, bottom: 0, background: bg, borderRadius: "28px 28px 0 0", padding: "10px 14px 16px", zIndex: 50 }}
    onClick={e => e.stopPropagation()}
  >
    <div style={{ width: 32, height: 4, borderRadius: 2, background: "rgba(255,255,255,.15)", margin: "0 auto 10px" }} />
    <div style={{ fontSize: 10, fontWeight: 600, textAlign: "center", marginBottom: 10, letterSpacing: ".3px", color: titleColor }}>Choose Your Kingdom</div>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
      {KS_CARDS.map(k => (
        <div key={k.id} onClick={() => { onSelect(k.id); onClose(); }}
          style={{ borderRadius: 14, padding: "10px 12px", cursor: "pointer", background: current === k.id ? k.c1.replace(".08", ".12") : k.c1, border: `${current === k.id ? "1.5px" : ".5px"} solid ${current === k.id ? k.c2 : "rgba(255,255,255,.08)"}`, position: "relative", transition: "all .2s" }}>
          <div style={{ fontSize: 20, marginBottom: 5, color: k.nc }}>{k.icon}</div>
          <div style={{ fontSize: 12, fontWeight: 700, color: k.nc, marginBottom: 2 }}>{k.name}</div>
          <div style={{ fontSize: 9, color: k.nc, opacity: .5 }}>{k.desc}</div>
          {current === k.id && <div style={{ position: "absolute", top: 8, right: 8, width: 14, height: 14, borderRadius: "50%", background: `${k.c1}`, border: `.5px solid ${k.nc}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: k.nc }}>✓</div>}
        </div>
      ))}
    </div>
  </div>
);

/* ── Pill ───────────────────────────────────────────────── */
const Pill = ({ children, bg, color, border }: { children: React.ReactNode; bg: string; color: string; border: string }) => (
  <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 9, fontWeight: 600, padding: "2px 8px", borderRadius: 20, background: bg, color, border: `.5px solid ${border}`, letterSpacing: ".3px" }}>{children}</span>
);

/* ══════════════════════════════════════════════════════════
   KINGDOM 1: WAR ROOM
══════════════════════════════════════════════════════════ */
const WarRoom = ({ modules, activeRow, feed, health, daily, elapsed, dots, mobile }: any) => {
  const [activeTab, setActiveTab] = useState<"ops"|"map"|"comms"|"sys">("ops");
  const S = { bg: "#030b03", text: "#39d353", dim: "#1a5c1a", faint: "#0a1a0a", border: "#1a2e1a", font: "monospace" };

  const tabs = [
    { id: "ops" as const, label: "OPS", icon: "◎" },
    { id: "map" as const, label: "MAP", icon: "⊞" },
    { id: "comms" as const, label: "COMMS", icon: "≡" },
    { id: "sys" as const, label: "SYS", icon: "⊙" },
  ];

  return (
    <div style={{ background: S.bg, height: "100%", display: "flex", flexDirection: "column" }}>
      {mobile && (
        <div style={{ display: "flex", borderBottom: `1px solid ${S.border}`, background: S.bg, flexShrink: 0 }}>
          {tabs.map(t => (
            <div key={t.id} onClick={() => setActiveTab(t.id)}
              style={{ flex: 1, padding: "8px 4px", textAlign: "center", fontFamily: S.font, fontSize: 9, letterSpacing: 1, color: activeTab === t.id ? S.text : S.dim, borderBottom: `2px solid ${activeTab === t.id ? S.text : "transparent"}`, cursor: "pointer", textTransform: "uppercase" }}>
              {t.label}
            </div>
          ))}
        </div>
      )}

      <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
        {/* OPS — Active Mission + Feed */}
        <div className={`empire-panel${mobile && activeTab !== "ops" ? " hidden" : ""}`} style={{ padding: "10px" }}>
          {/* Active mission */}
          <div style={{ fontFamily: S.font, fontSize: 8, color: S.dim, letterSpacing: 2, textTransform: "uppercase", marginBottom: 5, borderBottom: `1px dashed ${S.border}`, paddingBottom: 3 }}>// CURRENT MISSION</div>
          <div style={{ background: "#040e04", border: `1px dashed ${S.text}`, borderRadius: 6, padding: "9px 10px", marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
              <span style={{ fontFamily: S.font, fontSize: 8, color: S.dim }}>EXEC://MOD.02/TASK.A</span>
              <span style={{ fontFamily: S.font, fontSize: 9, color: S.text, display: "flex", alignItems: "center", gap: 4 }}>
                <span className="ld" style={{ width: 5, height: 5, borderRadius: "50%", background: S.text, display: "inline-block" }} />
                MANAV.CODING{dots}
              </span>
            </div>
            <div style={{ fontFamily: S.font, fontSize: 11, color: S.text, lineHeight: 1.5, marginBottom: 6 }}>
              {activeRow ? activeRow.content.slice(0, 100) : "verification_queue — autonomous loop closure. tasks self-verify. zero human triggers."}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontFamily: S.font, fontSize: 9, color: S.dim }}>
              <span>MOD:02 TASK:A</span>
              <span style={{ color: S.text }}>{elapsed}</span>
            </div>
          </div>

          {/* Stats row */}
          <div style={{ fontFamily: S.font, fontSize: 8, color: S.dim, letterSpacing: 2, textTransform: "uppercase", marginBottom: 5, borderBottom: `1px dashed ${S.border}`, paddingBottom: 3 }}>// DAILY OPS</div>
          <div style={{ display: "flex", border: `1px dashed ${S.border}`, borderRadius: 4, overflow: "hidden", marginBottom: 10 }}>
            {[["DONE", daily.tasksDone, S.text], ["LIVE", 1, S.text], ["DAYS", daily.buildDays, S.text], ["COST", `$${daily.costToday.toFixed(2)}`, S.text]].map(([l, v, c]) => (
              <div key={String(l)} style={{ flex: 1, padding: "7px 4px", textAlign: "center", borderRight: `1px dashed ${S.border}` }}>
                <div style={{ fontFamily: S.font, fontSize: 14, fontWeight: 700, color: c as string, lineHeight: 1 }}>{String(v)}</div>
                <div style={{ fontFamily: S.font, fontSize: 7, color: S.dim, textTransform: "uppercase", marginTop: 2 }}>{String(l)}</div>
              </div>
            ))}
          </div>

          {/* Ops feed */}
          <div style={{ fontFamily: S.font, fontSize: 8, color: S.dim, letterSpacing: 2, textTransform: "uppercase", marginBottom: 5, borderBottom: `1px dashed ${S.border}`, paddingBottom: 3 }}>// SIGNAL FEED</div>
          <div style={{ background: "#040e04", border: `1px dashed ${S.border}`, borderRadius: 6, padding: "8px 10px" }}>
            {feed.slice(0, 6).map((f: ActivityLine) => (
              <div key={f.id} style={{ display: "grid", gridTemplateColumns: "40px 14px 1fr", gap: 5, padding: "4px 0", borderBottom: `1px dashed #0a1a0a` }}>
                <span style={{ fontFamily: S.font, fontSize: 9, color: S.dim }}>{f.time}</span>
                <span style={{ fontSize: 11, color: f.color }}>{f.icon}</span>
                <span style={{ fontFamily: S.font, fontSize: 9, color: "#2a7a2a", lineHeight: 1.3 }}>{f.text.slice(0, 55)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* MAP — Sector Map */}
        <div className={`empire-panel${mobile && activeTab !== "map" ? " hidden" : ""}`} style={{ padding: "10px" }}>
          <div style={{ fontFamily: S.font, fontSize: 8, color: S.dim, letterSpacing: 2, textTransform: "uppercase", marginBottom: 8, borderBottom: `1px dashed ${S.border}`, paddingBottom: 3 }}>// SECTOR MAP — 12 MODULES</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6, marginBottom: 12 }}>
            {modules.map((m: ModuleState) => (
              <div key={m.num} className={m.status === "building" ? "blink-build" : ""}
                style={{ height: 36, borderRadius: 5, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2, border: `1px solid`, borderColor: m.status === "done" ? "#1a5c1a" : m.status === "building" ? S.text : "#0f1f0f", background: m.status === "done" ? "rgba(57,211,83,.1)" : m.status === "building" ? "rgba(57,211,83,.18)" : "rgba(0,0,0,.2)" }}>
                <span style={{ fontFamily: S.font, fontSize: 10, fontWeight: 700, color: m.status === "pending" ? "#1a3a1a" : S.text }}>{String(m.num).padStart(2, "0")}</span>
                <span style={{ fontFamily: S.font, fontSize: 7, color: m.status === "done" ? S.text : m.status === "building" ? S.text : "#1a3a1a" }}>{m.status === "done" ? "DONE" : m.status === "building" ? "LIVE" : "—"}</span>
              </div>
            ))}
          </div>
          {/* Threat levels */}
          <div style={{ fontFamily: S.font, fontSize: 8, color: S.dim, letterSpacing: 2, textTransform: "uppercase", marginBottom: 8, borderBottom: `1px dashed ${S.border}`, paddingBottom: 3 }}>// THREAT ASSESSMENT</div>
          <div style={{ background: "#040e04", border: `1px dashed ${S.border}`, borderRadius: 6, padding: "8px 10px" }}>
            {[["TS.CHECK", 100, S.text, "CLEAN"], ["GIT.SYNC", 100, S.text, "SYNC"], ["DB.CONN", 100, S.text, "OK"], ["ALGO.RISK", 20, "#eab308", "LOW"]].map(([l, v, c, lbl]) => (
              <div key={String(l)} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                <span style={{ fontFamily: S.font, fontSize: 8, color: S.dim, width: 60, flexShrink: 0 }}>{String(l)}</span>
                <div style={{ flex: 1, height: 3, background: "#0f1f0f", borderRadius: 2, overflow: "hidden" }}>
                  <div style={{ width: `${v}%`, height: "100%", background: c as string, borderRadius: 2 }} />
                </div>
                <span style={{ fontFamily: S.font, fontSize: 9, color: c as string, minWidth: 36, textAlign: "right" }}>{String(lbl)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* COMMS — Log */}
        <div className={`empire-panel${mobile && activeTab !== "comms" ? " hidden" : ""}`} style={{ padding: "10px" }}>
          <div style={{ fontFamily: S.font, fontSize: 8, color: S.dim, letterSpacing: 2, textTransform: "uppercase", marginBottom: 8, borderBottom: `1px dashed ${S.border}`, paddingBottom: 3 }}>// COMMS LOG</div>
          {feed.map((f: ActivityLine) => (
            <div key={f.id} style={{ background: "#040e04", border: `1px dashed ${S.border}`, borderRadius: 5, padding: "7px 9px", marginBottom: 5 }}>
              <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 3 }}>
                <span style={{ fontSize: 11, color: f.color }}>{f.icon}</span>
                <span style={{ fontFamily: S.font, fontSize: 9, color: S.text, flex: 1 }}>{f.text.slice(0, 50)}</span>
                <span style={{ fontFamily: S.font, fontSize: 8, color: S.dim }}>{f.time}</span>
              </div>
            </div>
          ))}
        </div>

        {/* SYS — Health */}
        <div className={`empire-panel${mobile && activeTab !== "sys" ? " hidden" : ""}`} style={{ padding: "10px" }}>
          <div style={{ fontFamily: S.font, fontSize: 8, color: S.dim, letterSpacing: 2, textTransform: "uppercase", marginBottom: 8, borderBottom: `1px dashed ${S.border}`, paddingBottom: 3 }}>// SYSTEM STATUS</div>
          {[["TYPESCRIPT", health.ts === "clean" ? "CLEAN" : "ERROR", health.ts === "clean" ? S.text : "#ef4444"], ["GIT.STATUS", "SYNCED", S.text], ["DATABASE", "OK", S.text], ["VERCEL.BUILD", "LIVE", S.text]].map(([l, v, c]) => (
            <div key={String(l)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", background: "#040e04", border: `1px dashed ${S.border}`, borderRadius: 5, marginBottom: 5 }}>
              <span style={{ fontFamily: S.font, fontSize: 10, color: S.dim }}>{String(l)}</span>
              <span style={{ fontFamily: S.font, fontSize: 10, fontWeight: 700, color: c as string }}>{String(v)}</span>
            </div>
          ))}
          <div style={{ marginTop: 10, fontFamily: S.font, fontSize: 8, color: S.dim, letterSpacing: 2, textTransform: "uppercase", marginBottom: 6, borderBottom: `1px dashed ${S.border}`, paddingBottom: 3 }}>// TREASURY</div>
          {[["TODAY", `$${daily.costToday.toFixed(2)}`], ["THIS MONTH", `$${daily.costMonth.toFixed(2)}`], ["TASKS", `${daily.monthTasks}`]].map(([l, v]) => (
            <div key={String(l)} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px dashed ${S.faint}` }}>
              <span style={{ fontFamily: S.font, fontSize: 9, color: S.dim }}>{String(l)}</span>
              <span style={{ fontFamily: S.font, fontSize: 10, color: S.text }}>{String(v)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

/* ══════════════════════════════════════════════════════════
   KINGDOM 2: ROYAL COURT
══════════════════════════════════════════════════════════ */
const RoyalCourt = ({ modules, activeRow, feed, health, daily, elapsed, dots, mobile }: any) => {
  const [activeTab, setActiveTab] = useState<"court"|"scroll"|"treasury"|"realm">("court");
  const S = { bg: "#08040f", text: "#f0e0c0", gold: "#f59e0b", goldDim: "#c9a227", goldFaint: "#3a2510", border: "rgba(245,158,11,.12)", accent: "rgba(245,158,11,.08)" };

  const completedModules = modules.filter((m: ModuleState) => m.status === "done").length;

  return (
    <div style={{ background: S.bg, height: "100%", display: "flex", flexDirection: "column" }}>
      {mobile && (
        <div style={{ display: "flex", borderBottom: `0.5px solid ${S.border}`, background: "rgba(12,6,24,.95)", flexShrink: 0 }}>
          {[["court","♛","Court"],["scroll","◈","Scroll"],["treasury","◆","Treasury"],["realm","⊞","Realm"]].map(([id,ic,lb]) => (
            <div key={id} onClick={() => setActiveTab(id as any)}
              style={{ flex: 1, padding: "8px 4px", textAlign: "center", fontSize: 9, color: activeTab === id ? S.gold : S.goldFaint, borderBottom: `2px solid ${activeTab === id ? S.gold : "transparent"}`, cursor: "pointer", fontStyle: "italic" }}>
              {lb}
            </div>
          ))}
        </div>
      )}

      <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
        {/* COURT — Main dashboard */}
        <div className={`empire-panel${mobile && activeTab !== "court" ? " hidden" : ""}`} style={{ padding: "14px" }}>
          {/* Crown ring + Progress */}
          <div style={{ display: "flex", alignItems: "center", gap: 14, padding: 14, background: S.accent, border: `0.5px solid ${S.border}`, borderRadius: 16, marginBottom: 12, position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: -20, right: -20, width: 80, height: 80, borderRadius: "50%", background: "radial-gradient(circle,rgba(245,158,11,.08),transparent 70%)" }} />
            <div style={{ position: "relative", flexShrink: 0 }}>
              <svg width="62" height="62" viewBox="0 0 62 62" style={{ transform: "rotate(-90deg)" }}>
                <circle fill="none" stroke="rgba(245,158,11,.1)" strokeWidth="5" cx="31" cy="31" r="25" />
                <circle fill="none" stroke={S.gold} strokeWidth="5" strokeLinecap="round" cx="31" cy="31" r="25"
                  strokeDasharray="157.1" strokeDashoffset={157.1 * (1 - completedModules / 12)} />
              </svg>
              <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: S.text, lineHeight: 1 }}>{Math.round(completedModules / 12 * 100)}%</div>
                <div style={{ fontSize: 7, color: S.goldDim, textTransform: "uppercase", letterSpacing: ".5px" }}>built</div>
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: S.text, marginBottom: 3 }}>SEO Season Empire</div>
              <div style={{ fontSize: 10, color: S.goldDim, marginBottom: 8, fontStyle: "italic" }}>Module 02 — The Closed Loop building</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ flex: 1, background: "rgba(245,158,11,.08)", borderRadius: 3, height: 4, overflow: "hidden" }}>
                  <div style={{ width: `${completedModules / 12 * 100}%`, height: "100%", background: `linear-gradient(90deg,${S.gold},${S.goldDim})`, borderRadius: 3 }} />
                </div>
                <span style={{ fontSize: 9, color: S.goldDim, fontStyle: "italic" }}>{completedModules}/12</span>
              </div>
            </div>
          </div>

          {/* Active task badge */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, padding: "10px 14px", background: "rgba(245,158,11,.04)", border: `0.5px solid ${S.border}`, borderRadius: 14 }}>
            <span className="ld" style={{ width: 6, height: 6, borderRadius: "50%", background: S.goldDim, display: "inline-block", flexShrink: 0 }} />
            <span style={{ fontSize: 11, color: S.text, fontStyle: "italic", flex: 1 }}>
              {activeRow ? activeRow.content.slice(0, 90) : "Building the verification queue — the loop that closes the empire."}
            </span>
            <span style={{ fontSize: 10, fontFamily: "monospace", color: S.goldDim }}>{elapsed}</span>
          </div>

          {/* Stats */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6, marginBottom: 12 }}>
            {[[daily.tasksDone,"Done"],[1,"Active"],[daily.buildDays,"Days"],[`$${daily.costToday.toFixed(2)}`, "Today"]].map(([v,l]) => (
              <div key={String(l)} style={{ background: S.accent, border: `0.5px solid ${S.border}`, borderRadius: 10, padding: "9px 6px", textAlign: "center" }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: S.goldDim, lineHeight: 1, marginBottom: 2 }}>{String(v)}</div>
                <div style={{ fontSize: 8, color: S.goldFaint, textTransform: "uppercase", letterSpacing: ".5px" }}>{String(l)}</div>
              </div>
            ))}
          </div>

          {/* Conquest map */}
          <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: 1.5, color: "rgba(245,158,11,.45)", textTransform: "uppercase", marginBottom: 7, fontStyle: "italic" }}>Conquest Map</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 4 }}>
            {modules.map((m: ModuleState) => {
              const roman = ["I","II","III","IV","V","VI","VII","VIII","IX","X","XI","XII"][m.num - 1];
              return (
                <div key={m.num} className={m.status === "building" ? "blink-build" : ""}
                  style={{ height: 28, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, border: `0.5px solid`, borderColor: m.status === "done" ? "rgba(245,158,11,.35)" : m.status === "building" ? S.gold : "rgba(255,255,255,.04)", background: m.status === "done" ? "rgba(245,158,11,.1)" : m.status === "building" ? "rgba(245,158,11,.18)" : "rgba(255,255,255,.02)", color: m.status === "pending" ? "rgba(255,255,255,.12)" : S.goldDim }}>
                  {roman}
                </div>
              );
            })}
          </div>
        </div>

        {/* SCROLL — Royal Decrees */}
        <div className={`empire-panel${mobile && activeTab !== "scroll" ? " hidden" : ""}`} style={{ padding: "14px" }}>
          <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: 1.5, color: "rgba(245,158,11,.45)", textTransform: "uppercase", marginBottom: 10, fontStyle: "italic" }}>Today's Royal Decrees</div>
          {feed.slice(0, 8).map((f: ActivityLine) => (
            <div key={f.id} style={{ display: "flex", gap: 10, padding: "9px 12px", background: S.accent, border: `0.5px solid ${S.border}`, borderRadius: 12, marginBottom: 6 }}>
              <span style={{ fontSize: 11, color: S.goldDim, flexShrink: 0, marginTop: 1 }}>♦</span>
              <span style={{ fontSize: 11, color: S.text, fontStyle: "italic", lineHeight: 1.5, opacity: .7 }}>{f.text.slice(0, 80)}</span>
            </div>
          ))}
        </div>

        {/* TREASURY */}
        <div className={`empire-panel${mobile && activeTab !== "treasury" ? " hidden" : ""}`} style={{ padding: "14px" }}>
          <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: 1.5, color: "rgba(245,158,11,.45)", textTransform: "uppercase", marginBottom: 10, fontStyle: "italic" }}>Royal Treasury</div>
          {[["Today's Expenditure", `$${daily.costToday.toFixed(2)}`, 0.75], ["This Moon's Total", `$${daily.costMonth.toFixed(2)}`, 0.85], ["Tasks Completed", `${daily.monthTasks}`, 0.6]].map(([l, v, fill]) => (
            <div key={String(l)} style={{ background: S.accent, border: `0.5px solid ${S.border}`, borderRadius: 14, padding: "12px 14px", marginBottom: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: 10, color: S.goldDim, fontStyle: "italic" }}>{String(l)}</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: S.goldDim, fontFamily: "monospace" }}>{String(v)}</span>
              </div>
              <div style={{ display: "flex", gap: 2 }}>
                {Array.from({ length: 12 }, (_, i) => (
                  <div key={i} style={{ flex: 1, height: 12, borderRadius: 3, background: i < Math.round(fill * 12) ? "rgba(245,158,11,.4)" : "rgba(245,158,11,.08)", border: ".5px solid rgba(245,158,11,.2)" }} />
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* REALM — Health */}
        <div className={`empire-panel${mobile && activeTab !== "realm" ? " hidden" : ""}`} style={{ padding: "14px" }}>
          <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: 1.5, color: "rgba(245,158,11,.45)", textTransform: "uppercase", marginBottom: 10, fontStyle: "italic" }}>Kingdom Health</div>
          {[["TypeScript", health.ts === "clean" ? "✦ Clean" : "✗ Errors", health.ts === "clean"], ["Git Repository", "✦ Synced", true], ["Database", "✦ Connected", true], ["Vercel Build", "✦ Live", true]].map(([l, v, ok]) => (
            <div key={String(l)} style={{ display: "flex", justifyContent: "space-between", padding: "11px 14px", background: S.accent, border: `0.5px solid ${S.border}`, borderRadius: 12, marginBottom: 6 }}>
              <span style={{ fontSize: 11, color: S.text, fontStyle: "italic" }}>{String(l)}</span>
              <span style={{ fontSize: 11, color: ok ? S.goldDim : "#ef4444", fontStyle: "italic" }}>{String(v)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

/* ══════════════════════════════════════════════════════════
   KINGDOM 3: NEURAL COMMAND
══════════════════════════════════════════════════════════ */
const NeuralCommand = ({ modules, activeRow, feed, health, daily, elapsed, dots, mobile }: any) => {
  const [activeTab, setActiveTab] = useState<"neural"|"nodes"|"signal"|"synapse">("neural");
  const S = { bg: "#02080f", text: "#e0f7ff", cyan: "#06b6d4", cyanDim: "#0e7490", cyanFaint: "#051520", border: "rgba(6,182,212,.1)", accent: "rgba(6,182,212,.05)" };

  return (
    <div style={{ background: S.bg, height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Metrics strip — always visible */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", borderBottom: `0.5px solid ${S.border}`, flexShrink: 0 }}>
        {[[daily.tasksDone, "tasks", "#10b981"],[`${Math.round(modules.filter((m: ModuleState) => m.status === "done").length/12*100)}%`, "built", S.cyan],[`$${daily.costToday.toFixed(2)}`, "cost", "#818cf8"]].map(([v, l, c]) => (
          <div key={String(l)} style={{ padding: "10px 6px", textAlign: "center", borderRight: `.5px solid ${S.border}` }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: c as string, lineHeight: 1, fontFamily: "monospace", marginBottom: 2 }}>{String(v)}</div>
            <div style={{ fontSize: 7, color: S.cyanDim, letterSpacing: 1, textTransform: "uppercase" }}>{String(l)}</div>
          </div>
        ))}
      </div>

      {mobile && (
        <div style={{ display: "flex", borderBottom: `0.5px solid ${S.border}`, background: "#020810", flexShrink: 0 }}>
          {[["neural","◉","NEURAL"],["nodes","⊕","NODES"],["signal","≡","SIGNAL"],["synapse","⌇","SYNAPSE"]].map(([id,ic,lb]) => (
            <div key={id} onClick={() => setActiveTab(id as any)}
              style={{ flex: 1, padding: "7px 2px", textAlign: "center", fontFamily: "monospace", fontSize: 8, letterSpacing: 1, color: activeTab === id ? S.cyan : S.cyanDim, borderBottom: `2px solid ${activeTab === id ? S.cyan : "transparent"}`, cursor: "pointer" }}>
              {lb}
            </div>
          ))}
        </div>
      )}

      <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
        {/* NEURAL — Active output */}
        <div className={`empire-panel${mobile && activeTab !== "neural" ? " hidden" : ""}`} style={{ padding: "12px 12px 10px" }}>
          <div style={{ fontSize: 8, letterSpacing: 2, color: S.cyanDim, textTransform: "uppercase", marginBottom: 6, display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: S.cyan, display: "inline-block" }} className="blink-build" />
            neural output
          </div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 5, background: S.accent, border: `.5px solid rgba(6,182,212,.2)`, borderRadius: 6, padding: "3px 10px", fontSize: 10, color: S.cyan, fontFamily: "monospace", marginBottom: 8 }}>
            <span className="ld" style={{ width: 4, height: 4, borderRadius: "50%", background: S.cyan, display: "inline-block" }} />
            manav.coding{dots}
          </div>
          <div style={{ fontSize: 12, color: "#b0e8f0", lineHeight: 1.55, marginBottom: 8, fontFamily: "monospace" }}>
            {activeRow ? activeRow.content.slice(0, 110) : "verification_queue — loop closure protocol. tasks self-verify. zero human triggers."}
          </div>
          <div style={{ fontFamily: "monospace", fontSize: 9, color: S.cyanDim, display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
            <span>mod_02.task_a</span>
            <span style={{ color: S.cyan }}>{elapsed}</span>
          </div>
          {/* Activity feed */}
          <div style={{ fontSize: 8, letterSpacing: 2, color: S.cyanDim, textTransform: "uppercase", marginBottom: 6 }}>signal feed</div>
          {feed.slice(0, 5).map((f: ActivityLine) => (
            <div key={f.id} style={{ display: "grid", gridTemplateColumns: "40px 16px 1fr", gap: 5, padding: "6px 0", borderBottom: `.5px solid rgba(6,182,212,.05)` }}>
              <span style={{ fontSize: 9, fontFamily: "monospace", color: S.cyanDim }}>{f.time}</span>
              <span style={{ fontSize: 12, color: f.color }}>{f.icon}</span>
              <span style={{ fontSize: 10, color: "#8ba8b0", lineHeight: 1.4 }}>{f.text.slice(0, 55)}</span>
            </div>
          ))}
        </div>

        {/* NODES — Module registry */}
        <div className={`empire-panel${mobile && activeTab !== "nodes" ? " hidden" : ""}`} style={{ padding: "12px" }}>
          <div style={{ fontSize: 8, letterSpacing: 2, color: S.cyanDim, textTransform: "uppercase", marginBottom: 10 }}>module registry</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginBottom: 12 }}>
            {modules.map((m: ModuleState) => (
              <div key={m.num} className={m.status === "building" ? "glow-build" : ""}
                style={{ aspectRatio: "1", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "monospace", fontSize: 10, fontWeight: 600, border: `${m.status === "building" ? "1.5" : "1"}px solid`, borderColor: m.status === "done" ? "rgba(6,182,212,.45)" : m.status === "building" ? S.cyan : "rgba(6,182,212,.08)", background: m.status === "done" ? "rgba(6,182,212,.12)" : m.status === "building" ? "rgba(6,182,212,.2)" : "rgba(6,182,212,.03)", color: m.status === "pending" ? "rgba(6,182,212,.2)" : S.cyan }}>
                {String(m.num).padStart(2, "0")}
              </div>
            ))}
          </div>
          <div style={{ fontSize: 8, letterSpacing: 2, color: S.cyanDim, textTransform: "uppercase", marginBottom: 8 }}>module index</div>
          {modules.slice(0, 6).map((m: ModuleState) => (
            <div key={m.num} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: `.5px solid rgba(6,182,212,.05)` }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: m.status === "done" ? S.cyan : m.status === "building" ? S.cyan : "#0e3042", flexShrink: 0 }} className={m.status === "building" ? "blink-build" : ""} />
              <span style={{ fontFamily: "monospace", fontSize: 9, color: S.cyanDim, width: 18, flexShrink: 0 }}>{String(m.num).padStart(2, "0")}</span>
              <span style={{ fontSize: 11, color: m.status === "pending" ? "rgba(6,182,212,.25)" : "#b0e8f0", flex: 1 }}>{m.name}</span>
              <span style={{ fontFamily: "monospace", fontSize: 9, color: m.status === "done" ? S.cyan : m.status === "building" ? S.cyan : "#0e3042" }}>{m.status === "done" ? "done" : m.status === "building" ? "live" : "—"}</span>
            </div>
          ))}
        </div>

        {/* SIGNAL — Bars */}
        <div className={`empire-panel${mobile && activeTab !== "signal" ? " hidden" : ""}`} style={{ padding: "12px" }}>
          <div style={{ fontSize: 8, letterSpacing: 2, color: S.cyanDim, textTransform: "uppercase", marginBottom: 10 }}>system signals</div>
          {[["ts.check", 100, "#10b981"], ["git.sync", 100, "#10b981"], ["db.conn", 100, "#10b981"], ["velocity", 80, S.cyan], ["quality", 100, S.cyan], ["blockers", 5, "#10b981"], ["month.cost", 35, "#818cf8"], ["days.streak", 60, "#818cf8"]].map(([l, v, c]) => (
            <div key={String(l)} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ fontFamily: "monospace", fontSize: 9, color: S.cyanDim, width: 68, flexShrink: 0 }}>{String(l)}</span>
              <div style={{ flex: 1, height: 3, background: "rgba(6,182,212,.08)", borderRadius: 2, overflow: "hidden" }}>
                <div style={{ width: `${v}%`, height: "100%", background: c as string, borderRadius: 2 }} />
              </div>
              <span style={{ fontFamily: "monospace", fontSize: 9, color: c as string, minWidth: 28, textAlign: "right" }}>{v}</span>
            </div>
          ))}
        </div>

        {/* SYNAPSE */}
        <div className={`empire-panel${mobile && activeTab !== "synapse" ? " hidden" : ""}`} style={{ padding: "12px" }}>
          <div style={{ fontSize: 8, letterSpacing: 2, color: S.cyanDim, textTransform: "uppercase", marginBottom: 10 }}>synaptic activity</div>
          <div style={{ background: S.accent, border: `.5px solid ${S.border}`, borderRadius: 12, padding: "16px 12px", marginBottom: 12 }}>
            <SynBars color1={S.cyan} color2="#818cf8" />
          </div>
          <div style={{ fontSize: 8, letterSpacing: 2, color: S.cyanDim, textTransform: "uppercase", marginBottom: 8 }}>momentum index</div>
          {[["velocity", 80, S.cyan], ["quality", 100, "#10b981"], ["consistency", 75, S.cyan], ["blockers", 0, "#10b981"]].map(([l, v, c]) => (
            <div key={String(l)} style={{ marginBottom: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                <span style={{ fontSize: 10, color: S.cyanDim, fontFamily: "monospace" }}>{String(l)}</span>
                <span style={{ fontSize: 10, fontFamily: "monospace", color: c as string }}>{v}</span>
              </div>
              <div style={{ height: 4, background: "rgba(6,182,212,.06)", borderRadius: 2, overflow: "hidden" }}>
                <div style={{ width: `${v}%`, height: "100%", background: c as string, borderRadius: 2 }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

/* ══════════════════════════════════════════════════════════
   KINGDOM 4: VISION (Glass)
══════════════════════════════════════════════════════════ */
const VisionKingdom = ({ modules, activeRow, feed, health, daily, elapsed, dots, mobile }: any) => {
  const [activeTab, setActiveTab] = useState<"empire"|"modules"|"vision"|"creator">("empire");
  const GC = ({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) => (
    <div style={{ background: "rgba(255,255,255,.055)", border: ".5px solid rgba(255,255,255,.1)", borderRadius: 18, padding: 14, position: "relative", overflow: "hidden", ...style }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1, background: "linear-gradient(90deg,transparent,rgba(255,255,255,.15),transparent)" }} />
      {children}
    </div>
  );

  return (
    <div style={{ background: "#08001a", height: "100%", display: "flex", flexDirection: "column", position: "relative", overflow: "hidden" }}>
      {/* Atmosphere orbs */}
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 0, background: "radial-gradient(ellipse 150px 150px at 20% 20%,rgba(139,92,246,.12),transparent),radial-gradient(ellipse 120px 120px at 80% 50%,rgba(6,182,212,.08),transparent)" }} />

      {mobile && (
        <div style={{ display: "flex", padding: "6px 14px 0", gap: 0, borderBottom: ".5px solid rgba(255,255,255,.06)", flexShrink: 0, position: "relative", zIndex: 5 }}>
          {[["empire","Empire"],["modules","Modules"],["vision","Vision"],["creator","Creator"]].map(([id, lb]) => (
            <div key={id} onClick={() => setActiveTab(id as any)}
              style={{ flex: 1, padding: "7px 4px", textAlign: "center", fontSize: 10, fontWeight: 600, color: activeTab === id ? "#fff" : "rgba(255,255,255,.28)", borderBottom: `2px solid ${activeTab === id ? "rgba(167,139,250,.7)" : "transparent"}`, cursor: "pointer", borderRadius: "9px 9px 0 0", background: activeTab === id ? "rgba(255,255,255,.05)" : "transparent", transition: "all .2s" }}>
              {lb}
            </div>
          ))}
        </div>
      )}

      <div style={{ flex: 1, overflow: "hidden", position: "relative", zIndex: 5 }}>

        {/* EMPIRE */}
        <div className={`empire-panel${mobile && activeTab !== "empire" ? " hidden" : ""}`} style={{ padding: "14px" }}>
          <GC style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: 1.5, color: "rgba(167,139,250,.6)", textTransform: "uppercase", marginBottom: 6 }}>The mission</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#fff", lineHeight: 1.25, marginBottom: 6, letterSpacing: "-.3px" }}>The SEO system that gets smarter every day</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,.42)", lineHeight: 1.55 }}>Not a tool you use. A system that learns, remembers, and compounds — for every client, every market, forever.</div>
          </GC>
          <div style={{ fontSize: 8, fontWeight: 600, letterSpacing: 1.5, color: "rgba(167,139,250,.5)", textTransform: "uppercase", marginBottom: 8, padding: "0 2px" }}>Right now</div>
          <div style={{ background: "rgba(255,255,255,.04)", border: ".5px solid rgba(255,255,255,.08)", borderRadius: 14, overflow: "hidden", marginBottom: 10 }}>
            {[["Done","9 auto-learning capture points active","rgba(16,185,129,.12)","#34d399","rgba(16,185,129,.2)"],["Done","Universal learning quality gate live","rgba(16,185,129,.12)","#34d399","rgba(16,185,129,.2)"],["Building","Auto-verification loop — closes itself","rgba(99,102,241,.12)","#a78bfa","rgba(99,102,241,.2)"],["Next","Visual empire · Automation · Language","rgba(255,255,255,.04)","rgba(255,255,255,.25)","rgba(255,255,255,.07)"]].map(([s,t,bg,c,bo]) => (
              <div key={t} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderBottom: ".5px solid rgba(255,255,255,.05)" }}>
                <span style={{ fontSize: 9, fontWeight: 600, padding: "2px 8px", borderRadius: 20, background: bg, color: c, border: `.5px solid ${bo}`, flexShrink: 0 }}>{s}</span>
                <span style={{ fontSize: 11, color: s === "Next" ? "rgba(255,255,255,.3)" : "rgba(255,255,255,.6)" }}>{t}</span>
              </div>
            ))}
          </div>
          {/* 12-module grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 5, background: "rgba(255,255,255,.03)", border: ".5px solid rgba(255,255,255,.06)", borderRadius: 14, padding: 10 }}>
            {modules.map((m: ModuleState) => (
              <div key={m.num} className={m.status === "building" ? "blink-build" : ""}
                style={{ height: 30, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, border: ".5px solid", borderColor: m.status === "done" ? "rgba(16,185,129,.3)" : m.status === "building" ? "rgba(99,102,241,.35)" : "rgba(255,255,255,.06)", background: m.status === "done" ? "rgba(16,185,129,.08)" : m.status === "building" ? "rgba(99,102,241,.1)" : "rgba(255,255,255,.02)", color: m.status === "done" ? "#34d399" : m.status === "building" ? "#a78bfa" : "rgba(255,255,255,.18)" }}>
                {String(m.num).padStart(2, "0")}
              </div>
            ))}
          </div>
        </div>

        {/* MODULES */}
        <div className={`empire-panel${mobile && activeTab !== "modules" ? " hidden" : ""}`} style={{ padding: "14px" }}>
          {modules.map((m: ModuleState) => (
            <div key={m.num} style={{ background: m.status === "done" ? "rgba(16,185,129,.05)" : m.status === "building" ? "rgba(99,102,241,.06)" : "rgba(255,255,255,.03)", border: `.5px solid ${m.status === "done" ? "rgba(16,185,129,.2)" : m.status === "building" ? "rgba(99,102,241,.25)" : "rgba(255,255,255,.07)"}`, borderRadius: 14, padding: 13, marginBottom: 8, position: "relative", overflow: "hidden" }} className={m.status === "building" ? "card-glow" : ""}>
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1, background: "linear-gradient(90deg,transparent,rgba(255,255,255,.08),transparent)" }} />
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                <div style={{ fontSize: 9, color: "rgba(255,255,255,.25)", fontFamily: "monospace" }}>MODULE {String(m.num).padStart(2, "0")}</div>
                <span style={{ fontSize: 9, fontWeight: 600, padding: "2px 8px", borderRadius: 20, background: m.status === "done" ? "rgba(16,185,129,.12)" : m.status === "building" ? "rgba(99,102,241,.12)" : "rgba(255,255,255,.04)", color: m.status === "done" ? "#34d399" : m.status === "building" ? "#a78bfa" : "rgba(255,255,255,.25)", border: `.5px solid ${m.status === "done" ? "rgba(16,185,129,.2)" : m.status === "building" ? "rgba(99,102,241,.2)" : "rgba(255,255,255,.06)"}` }}>
                  {m.status === "done" ? "DONE" : m.status === "building" ? "BUILDING" : "PENDING"}
                </span>
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: m.status === "pending" ? "rgba(255,255,255,.45)" : "#fff", marginBottom: 5, letterSpacing: "-.2px" }}>{m.name}</div>
              <div style={{ height: 3, background: "rgba(255,255,255,.05)", borderRadius: 2, overflow: "hidden" }}>
                <div style={{ width: m.status === "done" ? "100%" : m.status === "building" ? "50%" : "0%", height: "100%", background: m.status === "done" ? "rgba(16,185,129,.5)" : "rgba(139,92,246,.5)", borderRadius: 2 }} />
              </div>
            </div>
          ))}
        </div>

        {/* VISION */}
        <div className={`empire-panel${mobile && activeTab !== "vision" ? " hidden" : ""}`} style={{ padding: "14px" }}>
          <GC style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: 1.5, color: "rgba(167,139,250,.6)", textTransform: "uppercase", marginBottom: 6 }}>The compounding curve</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {[["Month 1","Starting up","8%","rgba(139,92,246,.35)"],["Month 3","50+ outcomes","25%","rgba(99,102,241,.45)"],["Month 6","Cross-project patterns","55%","rgba(99,102,241,.6)"],["Month 12","Industry models live","85%","linear-gradient(90deg,#6366f1,#10b981)"],["Month 24","The moat is real","100%","linear-gradient(90deg,#a78bfa,#34d399)"]].map(([m,l,w,bg]) => (
                <div key={m}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, marginBottom: 3 }}>
                    <span style={{ color: m === "Month 24" ? "#c4b5fd" : "rgba(255,255,255,.4)", fontWeight: m === "Month 24" ? 600 : 400 }}>{m}</span>
                    <span style={{ color: m === "Month 24" ? "#34d399" : "rgba(255,255,255,.4)", fontWeight: m === "Month 24" ? 600 : 400 }}>{l}</span>
                  </div>
                  <div style={{ background: "rgba(255,255,255,.05)", borderRadius: 2, height: 4, overflow: "hidden" }}>
                    <div style={{ width: w, height: "100%", background: bg, borderRadius: 2 }} />
                  </div>
                </div>
              ))}
            </div>
          </GC>
          <div style={{ fontSize: 8, fontWeight: 600, letterSpacing: 1.5, color: "rgba(167,139,250,.5)", textTransform: "uppercase", marginBottom: 8, padding: "0 2px" }}>vs every other tool</div>
          {[["Semrush / Ahrefs","Shows · forgets","rgba(239,68,68,.5)"],["ChatGPT / Claude","Writes · forgets","rgba(239,68,68,.5)"],["Notion / Linear","Tracks · forgets","rgba(239,68,68,.5)"],["SEO Season","Executes · verifies · compounds","#34d399"]].map(([n, d, c]) => (
            <div key={n} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: n === "SEO Season" ? "rgba(99,102,241,.08)" : "rgba(255,255,255,.03)", border: `.5px solid ${n === "SEO Season" ? "rgba(99,102,241,.25)" : "rgba(255,255,255,.06)"}`, borderRadius: 10, marginBottom: 6 }}>
              <span style={{ fontSize: 11, color: n === "SEO Season" ? "#c4b5fd" : "rgba(255,255,255,.4)", fontWeight: n === "SEO Season" ? 600 : 400 }}>{n}</span>
              <span style={{ fontSize: 9, color: c }}>{d}</span>
            </div>
          ))}
        </div>

        {/* CREATOR */}
        <div className={`empire-panel${mobile && activeTab !== "creator" ? " hidden" : ""}`} style={{ padding: "14px" }}>
          <div style={{ background: "rgba(255,255,255,.04)", border: ".5px solid rgba(255,255,255,.1)", borderRadius: 20, padding: 16, textAlign: "center", marginBottom: 12, position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: -30, left: "50%", transform: "translateX(-50%)", width: 100, height: 100, borderRadius: "50%", background: "radial-gradient(circle,rgba(139,92,246,.12),transparent 70%)" }} />
            <div style={{ width: 60, height: 60, borderRadius: "50%", background: "linear-gradient(135deg,rgba(139,92,246,.3),rgba(6,182,212,.2))", border: ".5px solid rgba(255,255,255,.15)", margin: "0 auto 10px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, position: "relative", zIndex: 1 }}>👑</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#fff", marginBottom: 3, letterSpacing: "-.3px" }}>Manav</div>
            <div style={{ fontSize: 9, color: "rgba(167,139,250,.6)", letterSpacing: 1, textTransform: "uppercase", marginBottom: 10 }}>Founder · Architect · King</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,.4)", lineHeight: 1.6, fontStyle: "italic" }}>"Building the empire every agency dreamt of — but never had the system to run."</div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 10 }}>
            {[["React + Vite","Frontend empire"],["Supabase","Brain memory"],["Claude API","Every AI call"],["Vercel Edge","12 serverless fns"],["TypeScript","End-to-end safety"],["Tailwind + shadcn","Every pixel"]].map(([n, d]) => (
              <div key={n} style={{ background: "rgba(255,255,255,.04)", border: ".5px solid rgba(255,255,255,.07)", borderRadius: 12, padding: "10px 12px" }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,.7)", marginBottom: 2 }}>{n}</div>
                <div style={{ fontSize: 9, color: "rgba(255,255,255,.3)", lineHeight: 1.3 }}>{d}</div>
              </div>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 8 }}>
            {[[12,"Modules planned","#a78bfa"],["∞","Markets served","#06b6d4"],[9,"AI learning pts","#34d399"],["#1","The goal","#f59e0b"]].map(([v, l, c]) => (
              <div key={String(l)} style={{ background: "rgba(255,255,255,.04)", border: ".5px solid rgba(255,255,255,.07)", borderRadius: 12, padding: "10px", textAlign: "center" }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: c, fontFamily: "monospace", lineHeight: 1 }}>{String(v)}</div>
                <div style={{ fontSize: 8, color: "rgba(255,255,255,.3)", marginTop: 4, textTransform: "uppercase", letterSpacing: ".5px" }}>{l}</div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
};

/* ══════════════════════════════════════════════════════════
   SIDEBAR (desktop)
══════════════════════════════════════════════════════════ */
const Sidebar = ({ modules, kingdom, daily, health }: { modules: ModuleState[]; kingdom: Kingdom; daily: DailyStats; health: HealthState }) => {
  const S = kingdom === "war" ? { bg: "#020a02", head: "#030b03", border: "#1a2e1a", title: "#39d353", dim: "#1a5c1a", font: "monospace" } :
            kingdom === "royal" ? { bg: "#060310", head: "#08040f", border: "rgba(245,158,11,.15)", title: "#f0e0c0", dim: "#8b6914", font: "inherit" } :
            kingdom === "neural" ? { bg: "#01060c", head: "#020810", border: "rgba(6,182,212,.1)", title: "#e0f7ff", dim: "#0e7490", font: "monospace" } :
            { bg: "#06001a", head: "#08001a", border: "rgba(255,255,255,.07)", title: "#f0f0ff", dim: "rgba(255,255,255,.3)", font: "inherit" };

  const done = modules.filter(m => m.status === "done").length;

  return (
    <div style={{ background: S.bg, borderRight: `.5px solid ${S.border}`, height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{ padding: "16px 14px 14px", borderBottom: `.5px solid ${S.border}` }}>
        <div style={{ fontSize: 9, fontFamily: S.font, letterSpacing: 2, color: S.dim, textTransform: "uppercase", marginBottom: 6 }}>
          {kingdom === "war" ? "EMPIRE.SECTORS" : kingdom === "royal" ? "Empire Modules" : kingdom === "neural" ? "MODULE.REGISTRY" : "Empire Modules"}
        </div>
        <div style={{ background: "rgba(255,255,255,.05)", borderRadius: 3, height: 5, overflow: "hidden", marginBottom: 5 }}>
          <div style={{ width: `${done / 12 * 100}%`, height: "100%", background: `linear-gradient(90deg,#6366f1,#10b981)`, borderRadius: 3 }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: S.dim, fontFamily: S.font }}>
          <span>{done} of 12 complete</span>
          <span>{Math.round(done / 12 * 100)}%</span>
        </div>
      </div>

      {/* Module list */}
      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: "8px" }}>
        {modules.map(m => {
          const iDone = m.status === "done", iBuilding = m.status === "building";
          return (
            <div key={m.num} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 8px", borderRadius: 9, border: ".5px solid", borderColor: iDone ? "rgba(16,185,129,.2)" : iBuilding ? "rgba(59,130,246,.2)" : "#1e1e3a", background: iDone ? "rgba(16,185,129,.04)" : iBuilding ? "rgba(59,130,246,.04)" : "#0d0d1a", marginBottom: 5, position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", left: 0, top: 3, bottom: 3, width: 2.5, borderRadius: 2, background: iDone ? "#10b981" : iBuilding ? "#3b82f6" : "transparent" }} />
              <div className={iBuilding ? "glow-build" : ""} style={{ width: 28, height: 28, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, flexShrink: 0, border: `1.5px solid ${iDone ? "#10b981" : iBuilding ? "#3b82f6" : "#2a2a3a"}`, background: iDone ? "rgba(16,185,129,.1)" : iBuilding ? "rgba(59,130,246,.1)" : "#0d0d1a", color: iDone ? "#10b981" : iBuilding ? "#3b82f6" : "transparent" }}>
                {iDone ? "✓" : iBuilding ? "⚡" : ""}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 9, letterSpacing: 1.5, color: "#4b4b6a", textTransform: "uppercase", marginBottom: 2, fontFamily: S.font }}>
                  {kingdom === "war" ? `SECTOR ${String(m.num).padStart(2, "0")}` : kingdom === "neural" ? `mod_${String(m.num).padStart(2, "0")}` : `Module ${String(m.num).padStart(2, "0")}`}
                </div>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#f0f0ff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.name}</div>
              </div>
              <span style={{ fontSize: 9, fontWeight: 500, padding: "2px 6px", borderRadius: 20, background: iDone ? "#0a2010" : iBuilding ? "#030d20" : "#0d0d1a", color: iDone ? "#10b981" : iBuilding ? "#3b82f6" : "#4b4b6a", border: `.5px solid ${iDone ? "rgba(16,185,129,.3)" : iBuilding ? "rgba(59,130,246,.3)" : "#1e1e3a"}`, flexShrink: 0 }}>
                {iDone ? "DONE" : iBuilding ? "BUILD" : "PEND"}
              </span>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div style={{ padding: "8px 10px", borderTop: `.5px solid ${S.border}`, display: "flex", gap: 5, flexWrap: "wrap" }}>
        {[["TS", health.ts === "clean"], ["Git", health.git !== "stale"], ["DB", health.db === "ok"], ["Build", true]].map(([l, ok]) => (
          <span key={String(l)} style={{ fontSize: 9, padding: "2px 6px", borderRadius: 5, fontWeight: 500, background: (ok as boolean) ? "#051008" : "#150303", color: (ok as boolean) ? "#10b981" : "#ef4444", border: `.5px solid ${(ok as boolean) ? "rgba(16,185,129,.3)" : "rgba(239,68,68,.3)"}` }}>
            {l} {(ok as boolean) ? "✓" : "✗"}
          </span>
        ))}
      </div>
    </div>
  );
};

/* ══════════════════════════════════════════════════════════
   MAIN BUILD COMPONENT
══════════════════════════════════════════════════════════ */
export default function Build() {
  const screen    = useScreen();
  const elapsed   = useElapsed();
  const dots      = useDots();
  const { rows, loading, lastSync, refetch } = useBridgeData(REFRESH_MS);
  const [kingdom, setKingdom]         = useState<Kingdom>("war");
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [pullVisible, setPullVisible] = useState(false);
  const pullRef   = useRef({ startY: 0, pulling: false });

  const state = useMemo(() => deriveState(rows), [rows]);

  /* Inject CSS */
  useEffect(() => {
    const s = document.createElement("style");
    s.id = "empire-css";
    s.textContent = EMPIRE_CSS;
    document.head.appendChild(s);
    return () => { document.getElementById("empire-css")?.remove(); };
  }, []);

  /* Pull-to-refresh handlers */
  const onTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (el.scrollTop === 0) {
      pullRef.current = { startY: e.touches[0].clientY, pulling: true };
    }
  };
  const onTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!pullRef.current.pulling) return;
    if (e.touches[0].clientY - pullRef.current.startY > 55) setPullVisible(true);
  };
  const onTouchEnd = () => {
    if (pullRef.current.pulling && pullVisible) {
      refetch();
      setTimeout(() => setPullVisible(false), 900);
    }
    pullRef.current.pulling = false;
  };

  /* Per-kingdom theme tokens */
  const theme = {
    war: {
      hBg: "rgba(3,11,3,.97)", hBorder: "#1a2e1a", title: "#39d353",
      tickBg: "rgba(57,211,83,.04)", tickBorder: "#1a2e1a",
      tickText: "#2a7a2a", tickFade: "#030b03", ldColor: "#39d353", sbBg: "#020a02",
    },
    royal: {
      hBg: "rgba(8,4,15,.97)", hBorder: "rgba(245,158,11,.12)", title: "#f0e0c0",
      tickBg: "rgba(245,158,11,.04)", tickBorder: "rgba(245,158,11,.1)",
      tickText: "#8b6914", tickFade: "#08040f", ldColor: "#c9a227", sbBg: "#060310",
    },
    neural: {
      hBg: "rgba(2,8,15,.97)", hBorder: "rgba(6,182,212,.1)", title: "#e0f7ff",
      tickBg: "rgba(6,182,212,.04)", tickBorder: "rgba(6,182,212,.1)",
      tickText: "#0e7490", tickFade: "#02080f", ldColor: "#06b6d4", sbBg: "#01060c",
    },
    glass: {
      hBg: "rgba(8,0,26,.85)", hBorder: "rgba(255,255,255,.07)", title: "#fff",
      tickBg: "rgba(255,255,255,.03)", tickBorder: "rgba(255,255,255,.05)",
      tickText: "rgba(167,139,250,.75)", tickFade: "rgba(8,0,26,.95)",
      ldColor: "#34d399", sbBg: "#06001a",
    },
  }[kingdom];

  const ksConfig = {
    war:    { sheetBg: "#020a02",  titleColor: "rgba(57,211,83,.4)"     },
    royal:  { sheetBg: "#06030d",  titleColor: "rgba(245,158,11,.4)"    },
    neural: { sheetBg: "#010608",  titleColor: "rgba(6,182,212,.3)"     },
    glass:  { sheetBg: "#06001a",  titleColor: "rgba(167,139,250,.4)"   },
  }[kingdom];

  const commonProps = {
    modules:   state.modules,
    activeRow: state.activeRow,
    feed:      state.feed,
    health:    state.health,
    daily:     state.daily,
    elapsed,
    dots,
    mobile:    screen.mobile,
  };

  return (
    <div id="empire-root">

      {/* ── Sidebar (desktop only) ── */}
      <div id="empire-sidebar">
        <Sidebar
          modules={state.modules}
          kingdom={kingdom}
          daily={state.daily}
          health={state.health}
        />
      </div>

      {/* ── Header ── */}
      <div id="empire-header" style={{ background: theme.hBg, borderBottom: `.5px solid ${theme.hBorder}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 16, color: "#f59e0b" }}>👑</span>
          <span style={{
            fontSize: screen.mobile ? 12 : 13,
            fontWeight: 700,
            color: theme.title,
            letterSpacing: (kingdom === "war" || kingdom === "neural") ? 2 : 0.2,
            fontFamily: (kingdom === "war" || kingdom === "neural") ? "monospace" : "inherit",
          }}>
            {screen.mobile
              ? "EMPIRE"
              : kingdom === "war"    ? "WAR ROOM — EMPIRE COMMAND"
              : kingdom === "royal"  ? "SEO Season — Royal Court"
              : kingdom === "neural" ? "NEURAL.CMD — EMPIRE"
              :                        "SEO Season — Vision"}
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {/* Screen info (desktop) */}
          {!screen.mobile && (
            <span style={{ fontSize: 10, color: "#4b4b6a", marginRight: 4 }}>
              {screen.w}×{screen.h} · {screen.wide ? "wide" : "desktop"}
            </span>
          )}

          {/* Live pill */}
          <span style={{ display: "flex", alignItems: "center", gap: 4, background: "rgba(16,185,129,.1)", border: ".5px solid rgba(16,185,129,.25)", borderRadius: 20, padding: "3px 8px", fontSize: 10, color: "#10b981", fontWeight: 600 }}>
            <span className="ld" style={{ width: 5, height: 5, borderRadius: "50%", background: "#10b981", display: "inline-block" }} />
            {loading ? "SYNC" : "LIVE"}
          </span>

          {/* Manual refresh — always visible */}
          <button
            onClick={refetch}
            title={`Refresh · Last sync: ${lastSync ? lastSync.toLocaleTimeString() : "never"}`}
            style={{ width: 30, height: 30, borderRadius: 8, border: ".5px solid #1e1e3a", background: "transparent", color: "#6b6b80", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, transition: "color .15s" }}
          >
            ↻
          </button>

          {/* Desktop kingdom tabs */}
          {!screen.mobile && (
            <div style={{ display: "flex", gap: 3, background: "#0d0d1a", border: ".5px solid #1e1e3a", borderRadius: 10, padding: "3px 4px" }}>
              {KS_CARDS.map(k => (
                <button
                  key={k.id}
                  onClick={() => setKingdom(k.id)}
                  style={{ padding: "4px 10px", borderRadius: 7, border: "none", background: kingdom === k.id ? k.c1 : "transparent", color: kingdom === k.id ? k.nc : "#4b4b6a", fontSize: 10, fontWeight: 600, cursor: "pointer", transition: "all .2s", letterSpacing: .3 }}
                >
                  {k.name.split(" ")[0]}
                </button>
              ))}
            </div>
          )}

          {/* Crown — kingdom switcher FAB (always visible) */}
          <button
            onClick={() => setSwitcherOpen(o => !o)}
            style={{ width: 30, height: 30, borderRadius: 8, border: ".5px solid rgba(245,158,11,.3)", background: "rgba(245,158,11,.06)", color: "#f59e0b", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}
            title="Switch Kingdom"
          >
            👑
          </button>
        </div>
      </div>

      {/* ── Ticker ── */}
      <div id="empire-ticker">
        <Ticker
          news={state.news}
          bg={theme.tickBg}
          textColor={theme.tickText}
          borderColor={theme.tickBorder}
          fadeColor={theme.tickFade}
        />
      </div>

      {/* ── Content area ── */}
      <div id="empire-content">
        <div
          style={{ position: "absolute", inset: 0, overflow: "hidden" }}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          {/* Pull-to-refresh indicator */}
          {pullVisible && (
            <div style={{ position: "absolute", top: 10, left: "50%", transform: "translateX(-50%)", fontSize: 22, zIndex: 10, animation: "ldpulse 600ms linear infinite" }}>
              👑
            </div>
          )}

          {/* Active Kingdom */}
          {kingdom === "war"    && <WarRoom       {...commonProps} />}
          {kingdom === "royal"  && <RoyalCourt    {...commonProps} />}
          {kingdom === "neural" && <NeuralCommand {...commonProps} />}
          {kingdom === "glass"  && <VisionKingdom {...commonProps} />}
        </div>

        {/* Dim overlay when switcher is open */}
        {switcherOpen && (
          <div
            style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 49 }}
            onClick={() => setSwitcherOpen(false)}
          />
        )}

        {/* Kingdom Switcher Sheet */}
        <KingdomSwitcher
          open={switcherOpen}
          current={kingdom}
          onSelect={setKingdom}
          onClose={() => setSwitcherOpen(false)}
          bg={ksConfig.sheetBg}
          titleColor={ksConfig.titleColor}
        />
      </div>

      {/* ── Bottom Nav (mobile only) ── */}
      <div
        id="empire-bottom-nav"
        style={{ background: theme.hBg, borderTop: `.5px solid ${theme.hBorder}` }}
      >
        {([
          ["⊕", "Modules"],
          ["⚡", "Active"],
          ["≡",  "Log"],
          ["♥",  "Health"],
        ] as [string, string][]).map(([icon, label]) => (
          <div
            key={label}
            style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "2px 0", cursor: "pointer" }}
          >
            <span style={{ fontSize: 19, color: theme.ldColor, opacity: .35 }}>{icon}</span>
            <span style={{ fontSize: 8, color: theme.ldColor, fontWeight: 500, opacity: .35, letterSpacing: .3 }}>{label}</span>
          </div>
        ))}
      </div>

    </div>
  );
}
