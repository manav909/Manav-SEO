/**
 * ◈ BRAIN COMMAND — Manav Brain Automation Mission Control
 *
 * Features:
 * - Visual card queue: pick cards from canvas, build an execution queue
 * - Parallel execution: up to 4 tasks run simultaneously
 * - Gantt-style timeline: each task is a live row with progress + output
 * - Real-time streaming: watch Brain work in real time
 * - Auto-save to Desk: every output saved automatically
 * - Brain chat: command Brain in plain English from the same panel
 * - Voice: speak commands
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import HelpPanel, { HELP } from '@/components/HelpPanel';
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import {
  Brain, Play, Pause, X, Zap, CheckCircle, AlertCircle, Clock,
  Loader2, ArrowLeft, Send, Mic, MicOff, ChevronRight,
  Plus, Layers, Target, BarChart3, Shield, Globe, Cpu,
  BookOpen, Save, Download, RefreshCw, Radio, Activity,
} from "lucide-react";

/* ── Types ── */
type TaskStatus = "queued" | "running" | "done" | "error" | "cancelled";
interface QueuedTask {
  id:        string;
  card:      any;
  status:    TaskStatus;
  output:    string;
  startedAt: number | null;
  doneAt:    number | null;
  savedDesk: boolean;
}

const TYPE_COLOR: Record<string, string> = {
  "quick-win": "#4ade80", technical: "#06b6d4", content: "#facc15",
  geo: "#6366f1", competitive: "#fb923c", insight: "#f472b6",
  weekly: "#60a5fa", monthly: "#a78bfa", kpi: "#34d399", custom: "#94a3b8",
};

const TYPE_ICON: Record<string, any> = {
  "quick-win": Zap, technical: Cpu, content: BookOpen,
  geo: Globe, competitive: BarChart3, insight: Brain,
  weekly: Clock, monthly: BarChart3, kpi: Activity, custom: Target,
};

let _uid = 0;
const uid = () => "bc" + (++_uid) + "_" + Math.random().toString(36).slice(2, 5);

function elapsed(ms: number): string {
  if (ms < 60000) return Math.floor(ms / 1000) + "s";
  return Math.floor(ms / 60000) + "m " + Math.floor((ms % 60000) / 1000) + "s";
}

/* ── Task Row (Gantt-style) ── */
function TaskRow({ task, onCancel, onSave }: {
  task: QueuedTask;
  onCancel: (id: string) => void;
  onSave:   (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [now, setNow] = useState(Date.now());
  const color   = TYPE_COLOR[task.card.type] || "#94a3b8";
  const Icon    = TYPE_ICON[task.card.type]  || Zap;
  const runtime = task.startedAt ? (task.doneAt || now) - task.startedAt : 0;

  useEffect(() => {
    if (task.status !== "running") return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [task.status]);

  return (
    <div style={{
      background: "rgba(255,255,255,0.02)", borderRadius: 10, overflow: "hidden",
      border: `1px solid ${task.status === "error" ? "rgba(239,68,68,0.25)" : task.status === "done" ? "rgba(16,185,129,0.2)" : color + "22"}`,
      transition: "all 0.3s",
    }}>
      <HelpPanel {...HELP["brain-command"]} pageId="brain-command" />
      {/* Row header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", cursor: "pointer" }}
        onClick={() => setExpanded(e => !e)}>
        {/* Status indicator */}
        <div style={{ width: 28, height: 28, borderRadius: 7, background: color + "14",
          border: "1px solid " + color + "30", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          {task.status === "running" ? <Loader2 size={12} style={{ color, animation: "spin 1s linear infinite" }}/> :
           task.status === "done"    ? <CheckCircle size={12} style={{ color: "#10b981" }}/> :
           task.status === "error"   ? <AlertCircle size={12} style={{ color: "#ef4444" }}/> :
           task.status === "queued"  ? <Clock size={12} style={{ color: "rgba(255,255,255,0.3)" }}/> :
                                       <X size={12} style={{ color: "rgba(255,255,255,0.2)" }}/>}
        </div>
        {/* Task info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.82)", marginBottom: 2,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {task.card.title}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 8, fontFamily: "monospace", color, background: color + "12",
              padding: "1px 5px", borderRadius: 3 }}>{task.card.type}</span>
            {task.startedAt && (
              <span style={{ fontSize: 8, fontFamily: "monospace", color: "rgba(255,255,255,0.25)" }}>
                {elapsed(runtime)}
              </span>
            )}
            <span style={{ fontSize: 8, fontFamily: "monospace", color: "rgba(255,255,255,0.2)",
              textTransform: "uppercase", letterSpacing: "0.1em" }}>{task.status}</span>
            {task.savedDesk && <span style={{ fontSize: 7, fontFamily: "monospace", color: "#10b981" }}>✓ saved to desk</span>}
          </div>
        </div>
        {/* Progress bar */}
        <div style={{ width: 80, height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden", flexShrink: 0 }}>
          {task.status === "running" && (
            <div style={{ height: "100%", background: color, borderRadius: 2, width: "100%",
              animation: "progressPulse 1.5s ease-in-out infinite" }}/>
          )}
          {task.status === "done" && <div style={{ height: "100%", width: "100%", background: "#10b981", borderRadius: 2 }}/>}
          {task.status === "error" && <div style={{ height: "100%", width: "100%", background: "#ef4444", borderRadius: 2 }}/>}
        </div>
        {/* Actions */}
        <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
          {task.status === "done" && !task.savedDesk && (
            <button onClick={e => { e.stopPropagation(); onSave(task.id); }} title="Save to Desk"
              style={{ background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.2)",
                borderRadius: 5, padding: "3px 7px", color: "#a5b4fc", fontSize: 8, fontFamily: "monospace", cursor: "pointer" }}>
              <Save size={9}/>
            </button>
          )}
          {(task.status === "queued" || task.status === "running") && (
            <button onClick={e => { e.stopPropagation(); onCancel(task.id); }}
              style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.2)", padding: 3 }}>
              <X size={10}/>
            </button>
          )}
        </div>
        <ChevronRight size={9} style={{ color: "rgba(255,255,255,0.2)", transform: expanded ? "rotate(90deg)" : "none", transition: "0.2s", flexShrink: 0 }}/>
      </div>
      {/* Expanded output */}
      {expanded && task.output && (
        <div style={{
          borderTop: "1px solid rgba(255,255,255,0.05)", padding: "10px 14px",
          maxHeight: 300, overflowY: "auto",
          background: task.status === "error" ? "rgba(239,68,68,0.04)" : "rgba(0,0,0,0.2)",
        }}>
          {task.status === "error" && (
            <div style={{ marginBottom: 8, fontSize: 9, fontFamily: "monospace", color: "#ef4444",
              background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)",
              borderRadius: 6, padding: "5px 8px", display: "flex", gap: 6, alignItems: "flex-start" }}>
              <span>❌</span>
              <span>Task failed — output below is the error returned by the server. Check Vercel → Functions → Logs for the full crash trace.</span>
            </div>
          )}
          <pre style={{
            fontSize: 10, lineHeight: 1.7, margin: 0,
            whiteSpace: "pre-wrap", wordBreak: "break-word", fontFamily: "inherit",
            color: task.status === "error" ? "rgba(252,165,165,0.8)" : "rgba(255,255,255,0.55)",
          }}>
            {task.output}
          </pre>
          {task.status === "done" && !task.savedDesk && (
            <div style={{ marginTop: 8, fontSize: 8, color: "rgba(255,255,255,0.2)", fontFamily: "monospace" }}>
              Output not yet saved to Desk — click the save button above.
            </div>
          )}
          {task.status === "done" && task.savedDesk && (
            <div style={{ marginTop: 8, fontSize: 8, color: "#10b981", fontFamily: "monospace" }}>
              ✓ Saved to Desk
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Main Component ── */
export default function BrainCommand() {
  const { projects, clients } = useAuth();
  const navigate = useNavigate();

  const [selProj,  setSelProj]  = useState(() => localStorage.getItem("seo_season_proj") || "");
  const [canvas,   setCanvas]   = useState<any[]>([]);
  const [queue,    setQueue]    = useState<QueuedTask[]>([]);
  const [running,  setRunning]  = useState(false);
  const [filter,   setFilter]   = useState("all");
  const [chatIn,   setChatIn]   = useState("");
  const [chatMsgs, setChatMsgs] = useState<{role:"user"|"brain";text:string}[]>([
    { role: "brain", text: "Brain Command online. Select tasks from the canvas below and hit Run All, or tell me what you want to do in plain English.\n\nI can run multiple tasks in parallel, save everything to your desk automatically, and learn from every execution." }
  ]);
  const [chatLoading, setChatLoading] = useState(false);
  const [listening,   setListening]   = useState(false);
  const [projContext, setProjContext]  = useState<any>(null);

  const voiceRef    = useRef<any>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const abortRefs   = useRef<Record<string, boolean>>({});

  const MAX_CONCURRENT = 4;

  useEffect(() => { chatBottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chatMsgs]);

  /* Load canvas cards */
  const loadCanvas = useCallback(async () => {
    if (!selProj) return;
    const { data } = await supabase.from("projects").select("playground_canvas, playground_strategy").eq("id", selProj).single();
    const cards = data?.playground_canvas || data?.playground_strategy?.canvas_blocks || [];
    setCanvas(cards);
    // Load project context
    try {
      const res  = await fetch("/api/control", { method: "POST", headers: { "Content-Type": "application/json", "X-Brain-Source": "app-page" },
        body: JSON.stringify({ action: "get_context", projectId: selProj }) });
      const json = await res.json().catch(() => ({}));
      if (json.context) setProjContext(json.context);
    } catch (_e) {}
  }, [selProj]);

  useEffect(() => {
    if (selProj) { localStorage.setItem("seo_season_proj", selProj); loadCanvas(); }
  }, [selProj, loadCanvas]);

  /* Add card to queue */
  const addToQueue = (card: any) => {
    if (!selProj) { alert("Select a project first."); return; }
    if (queue.some(q => q.card.id === card.id)) return;
    setQueue(q => [...q, { id: uid(), card, status: "queued", output: "", startedAt: null, doneAt: null, savedDesk: false }]);
  };

  const removeFromQueue = (id: string) => {
    abortRefs.current[id] = true;
    setQueue(q => q.filter(t => t.id !== id));
  };

  /* Execute a single task with streaming */
  const executeTask = async (task: QueuedTask): Promise<void> => {
    if (abortRefs.current[task.id]) return;
    setQueue(q => q.map(t => t.id === task.id ? { ...t, status: "running", startedAt: Date.now() } : t));
    try {
      const res = await fetch("/api/task-engine", {
        method: "POST", headers: { "Content-Type": "application/json", "X-Brain-Source": "app-page" },
        body: JSON.stringify({ action: "execute", card: task.card, context: projContext || {},
          projectId: selProj, role: "senior_seo", brainLearnings: [] }),
      });
      if (!res.body) throw new Error("No stream");
      const reader = res.body.getReader();
      const dec    = new TextDecoder();
      let   full   = "";
      while (true) {
        if (abortRefs.current[task.id]) { reader.cancel(); break; }
        const { done, value } = await reader.read();
        if (done) break;
        full += dec.decode(value);
        setQueue(q => q.map(t => t.id === task.id ? { ...t, output: full } : t));
      }
      setQueue(q => q.map(t => t.id === task.id
        ? { ...t, status: abortRefs.current[task.id] ? "cancelled" : "done", doneAt: Date.now(), output: full }
        : t));
      // Auto-save to desk
      if (full.length > 200 && selProj && !abortRefs.current[task.id]) {
        await fetch("/api/task-engine", { method: "POST", headers: { "Content-Type": "application/json", "X-Brain-Source": "app-page" },
          body: JSON.stringify({ action: "save_to_desk", project_id: selProj,
            title: task.card.title || "Task Output", content: full,
            content_type: task.card.type === "technical" ? "code" : task.card.type === "audit" ? "audit" : "report",
            source: "brain_command", tags: [task.card.type, "brain_command"] }) });
        setQueue(q => q.map(t => t.id === task.id ? { ...t, savedDesk: true } : t));
      }
    } catch (e: any) {
      setQueue(q => q.map(t => t.id === task.id ? { ...t, status: "error", output: e.message, doneAt: Date.now() } : t));
    }
  };

  /* Run all queued tasks in parallel (up to MAX_CONCURRENT) */
  const runAll = useCallback(async () => {
    const pending = queue.filter(t => t.status === "queued");
    if (pending.length === 0) return;
    setRunning(true);
    const taskQueue = [...pending];
    const active: Promise<void>[] = [];
    while (taskQueue.length > 0 || active.length > 0) {
      while (taskQueue.length > 0 && active.length < MAX_CONCURRENT) {
        const task = taskQueue.shift()!;
        const p: Promise<void> = executeTask(task).then(() => {
          active.splice(active.indexOf(p as Promise<void>), 1);
        });
        active.push(p);
      }
      if (active.length > 0) await Promise.race(active);
    }
    setRunning(false);
    // Read actual final task statuses to give an honest report
    setQueue(finalQueue => {
      const ran      = finalQueue.filter(t => pending.some(p => p.id === t.id));
      const done     = ran.filter(t => t.status === "done");
      const errors   = ran.filter(t => t.status === "error");
      const cancelled= ran.filter(t => t.status === "cancelled");

      let msg = "";
      if (errors.length === 0 && cancelled.length === 0) {
        msg = `✅ All ${done.length} task${done.length !== 1 ? "s" : ""} completed successfully. Outputs saved to Desk.`;
      } else if (done.length === 0) {
        msg = `❌ All ${errors.length} task${errors.length !== 1 ? "s" : ""} failed.\n\n` +
          errors.map(t => `• **${t.card.title}**: ${t.output.slice(0, 150)}`).join("\n") +
          "\n\nI couldn't complete these. This usually means the API function crashed or timed out. Check Vercel logs or try again.";
      } else {
        const errList = errors.map(t => `• **${t.card.title}**: ${t.output.slice(0, 120)}`).join("\n");
        msg = `⚠️ ${done.length} task${done.length !== 1 ? "s" : ""} succeeded, ${errors.length} failed.\n\n` +
          `**Failed tasks:**\n${errList}\n\n` +
          `Successful outputs saved to Desk. Failed tasks can be retried — clear the queue, re-add them, and run again.`;
      }

      setChatMsgs(m => [...m, { role: "brain" as const, text: msg }]);
      return finalQueue;
    });
  }, [queue, selProj, projContext]);

  /* Save task output to desk manually */
  const saveTaskToDesk = useCallback(async (id: string) => {
    const task = queue.find(t => t.id === id);
    if (!task || !selProj) return;
    await fetch("/api/task-engine", { method: "POST", headers: { "Content-Type": "application/json", "X-Brain-Source": "app-page" },
      body: JSON.stringify({ action: "save_to_desk", project_id: selProj,
        title: task.card.title, content: task.output,
        content_type: "report", source: "brain_command", tags: [task.card.type] }) });
    setQueue(q => q.map(t => t.id === id ? { ...t, savedDesk: true } : t));
  }, [queue, selProj]);

  /* Brain chat */
  const sendChat = useCallback(async () => {
    const text = chatIn.trim();
    if (!text || chatLoading) return;
    setChatIn("");
    setChatMsgs(m => [...m, { role: "user", text }]);
    setChatLoading(true);
    try {
      // Build queue context and inject it into the question
      const queueContext = queue.length > 0
        ? `\n\nCURRENT EXECUTION QUEUE (${queue.length} tasks):\n` +
          queue.map(t => `  [${t.status.toUpperCase()}] ${t.card.title} (${t.card.type})`).join("\n")
        : "";
      const enrichedQuestion = text + queueContext;

      const res = await fetch("/api/intelligence", { method: "POST", headers: { "Content-Type": "application/json", "X-Brain-Source": "app-page" },
        body: JSON.stringify({
          mode: "brain_assistant",
          question: enrichedQuestion,
          projectId: selProj || null,
          projectSummary: selProj ? (projContext?.project?.name || "Brain Command panel") : "No project selected",
          role: "senior_seo",
          brainAssistantContext: {
            projectContext: projContext,
            canvasBlocks: canvas.slice(0, 20),
            learnings: [],
            algoItems: [],
            history: chatMsgs.slice(-6).map(m => ({ role: m.role === "user" ? "user" : "assistant", content: m.text.slice(0, 200) })),
          },
        }),
      });
      if (!res.body) throw new Error("No stream");
      const reader = res.body.getReader(); const dec = new TextDecoder(); let full = "";
      setChatMsgs(m => [...m, { role: "brain", text: "" }]);
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        full += dec.decode(value);
        setChatMsgs(m => { const c = [...m]; c[c.length - 1] = { role: "brain", text: full }; return c; });
      }
    } catch (e: any) {
      setChatMsgs(m => [...m, { role: "brain", text: "Error: " + e.message }]);
    }
    setChatLoading(false);
  }, [chatIn, chatLoading, selProj, projContext, canvas, queue]);

  /* Voice */
  const toggleVoice = () => {
    if (listening) { voiceRef.current?.stop(); setListening(false); return; }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { alert("Voice requires Chrome or Edge"); return; }
    const r = new SR(); r.continuous = false; r.interimResults = true; r.lang = "en-GB";
    r.onresult = (e: any) => { const t = Array.from(e.results).map((x: any) => x[0].transcript).join(""); setChatIn(t); };
    r.onend = () => setListening(false); r.onerror = () => setListening(false);
    voiceRef.current = r; r.start(); setListening(true);
  };

  /* Canvas filter */
  const types    = ["all", ...Array.from(new Set(canvas.map((c: any) => c.type)))];
  const filtered = filter === "all" ? canvas : canvas.filter((c: any) => c.type === filter);
  const queueIds = new Set(queue.map(t => t.card.id));

  const runningCount  = queue.filter(t => t.status === "running").length;
  const doneCount     = queue.filter(t => t.status === "done").length;
  const queuedCount   = queue.filter(t => t.status === "queued").length;
  const selProject    = projects.find(p => p.id === selProj);
  const selClient     = clients.find(c => c.id === selProject?.client_id);

  return (
    <div style={{ height: "100vh", background: "#030712", color: "white", fontFamily: "system-ui,sans-serif",
      display: "flex", flexDirection: "column", overflow: "hidden" }}>

      {/* Background */}
      <div style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none" }}>
        <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.025 }}>
          <defs><pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#a5b4fc" strokeWidth="0.5"/>
          </pattern></defs><rect width="100%" height="100%" fill="url(#grid)"/>
        </svg>
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 70% 40% at 50% 0%,rgba(99,102,241,0.07) 0%,transparent 70%)" }}/>
      </div>

      {/* ── HEADER ── */}
      <div style={{ position: "relative", zIndex: 10, display: "flex", alignItems: "center", gap: 12, padding: "10px 20px",
        background: "rgba(0,0,0,0.6)", borderBottom: "1px solid rgba(99,102,241,0.15)", backdropFilter: "blur(20px)", flexShrink: 0 }}>
        <button onClick={() => navigate(-1)} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 7, padding: "5px 9px", cursor: "pointer", color: "rgba(255,255,255,0.4)", display: "flex", alignItems: "center", gap: 4, fontSize: 10 }}>
          <ArrowLeft size={11}/>
        </button>
        <Brain size={18} style={{ color: "#a5b4fc", filter: "drop-shadow(0 0 8px rgba(99,102,241,0.8))" }}/>
        <div>
          <div style={{ fontSize: 13, fontWeight: 900, fontFamily: "monospace", letterSpacing: "0.08em", color: "#e0e7ff" }}>
            ◈ BRAIN COMMAND
          </div>
          <div style={{ fontSize: 8, fontFamily: "monospace", color: "rgba(255,255,255,0.2)" }}>
            Automation Mission Control · {runningCount > 0 ? runningCount + " RUNNING" : queuedCount > 0 ? queuedCount + " QUEUED" : "IDLE"}
          </div>
        </div>
        {/* Status pills */}
        <div style={{ display: "flex", gap: 6 }}>
          {[
            { label: queuedCount + " Queued",  color: "#6366f1", show: queuedCount > 0 },
            { label: runningCount + " Running", color: "#f59e0b", show: runningCount > 0 },
            { label: doneCount + " Done",       color: "#10b981", show: doneCount > 0 },
          ].filter(p => p.show).map((p, i) => (
            <span key={i} style={{ fontSize: 8, fontFamily: "monospace", color: p.color, background: p.color + "18",
              border: "1px solid " + p.color + "30", borderRadius: 12, padding: "2px 8px" }}>{p.label}</span>
          ))}
        </div>
        <div style={{ flex: 1 }}/>
        {/* Project selector */}
        <select value={selProj} onChange={e => setSelProj(e.target.value)}
          style={{ height: 30, padding: "0 10px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 7, fontSize: 10, color: "rgba(255,255,255,0.6)", outline: "none", cursor: "pointer" }}>
          <option value="">Select Project</option>
          {projects.map(p => { const cl = clients.find(c => c.id === p.client_id); return (
            <option key={p.id} value={p.id}>{cl?.company || p.name}</option>
          ); })}
        </select>
        {/* Run All */}
        <button onClick={runAll} disabled={running || queuedCount === 0}
          style={{ display: "flex", alignItems: "center", gap: 6, background: running || queuedCount === 0
            ? "rgba(99,102,241,0.12)" : "linear-gradient(135deg,#6366f1,#4f46e5)",
            border: "none", borderRadius: 8, padding: "7px 16px", color: "white", fontSize: 10,
            fontFamily: "monospace", fontWeight: 700, cursor: running || queuedCount === 0 ? "default" : "pointer",
            boxShadow: running || queuedCount === 0 ? "none" : "0 0 16px rgba(99,102,241,0.4)" }}>
          {running ? <Loader2 size={11} style={{ animation: "spin 1s linear infinite" }}/> : <Play size={11}/>}
          {running ? "RUNNING..." : "RUN ALL (" + queuedCount + ")"}
        </button>
      </div>

      {/* ── MAIN LAYOUT: Canvas | Execution Queue | Brain Chat ── */}
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "280px 1fr 340px", overflow: "hidden", position: "relative", zIndex: 1 }}>

        {/* LEFT: Canvas card browser */}
        <div style={{ borderRight: "1px solid rgba(255,255,255,0.05)", display: "flex", flexDirection: "column",
          background: "rgba(0,0,0,0.2)", overflow: "hidden" }}>
          <div style={{ padding: "12px 14px 6px", borderBottom: "1px solid rgba(255,255,255,0.05)", flexShrink: 0 }}>
            <div style={{ fontSize: 8, fontFamily: "monospace", color: "rgba(255,255,255,0.2)", letterSpacing: "0.12em", marginBottom: 8 }}>
              CANVAS CARDS · {canvas.length} TOTAL
            </div>
            {/* Type filter */}
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {types.slice(0, 7).map(t => (
                <button key={t} onClick={() => setFilter(t)}
                  style={{ background: filter === t ? (TYPE_COLOR[t] || "#6366f1") + "18" : "rgba(255,255,255,0.03)",
                    border: `1px solid ${filter === t ? (TYPE_COLOR[t] || "#6366f1") + "40" : "rgba(255,255,255,0.07)"}`,
                    borderRadius: 5, padding: "2px 7px", fontSize: 8, fontFamily: "monospace",
                    color: filter === t ? (TYPE_COLOR[t] || "#a5b4fc") : "rgba(255,255,255,0.3)", cursor: "pointer" }}>
                  {t}
                </button>
              ))}
            </div>
          </div>
          {/* Card list */}
          <div style={{ flex: 1, overflow: "auto", padding: "8px 10px", display: "flex", flexDirection: "column", gap: 5 }}>
            {!selProj ? (
              <div style={{ textAlign: "center", padding: "40px 0", color: "rgba(255,255,255,0.15)", fontSize: 10, fontFamily: "monospace" }}>
                SELECT A PROJECT
              </div>
            ) : filtered.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 0", color: "rgba(255,255,255,0.15)", fontSize: 10, fontFamily: "monospace" }}>
                NO CARDS FOUND
              </div>
            ) : filtered.map((card: any, i: number) => {
              const color  = TYPE_COLOR[card.type] || "#94a3b8";
              const Icon   = TYPE_ICON[card.type]  || Zap;
              const inQ    = queueIds.has(card.id);
              return (
                <button key={card.id || i} onClick={() => !inQ && addToQueue(card)} disabled={inQ}
                  style={{ width: "100%", background: inQ ? color + "08" : "rgba(255,255,255,0.02)",
                    border: `1px solid ${inQ ? color + "30" : "rgba(255,255,255,0.06)"}`,
                    borderLeft: `3px solid ${color}`, borderRadius: 7, padding: "7px 9px",
                    cursor: inQ ? "default" : "pointer", textAlign: "left",
                    opacity: card.status === "done" ? 0.5 : 1 }}>
                  <div style={{ fontSize: 9, color: inQ ? color : "rgba(255,255,255,0.65)", fontWeight: 600,
                    lineHeight: 1.3, marginBottom: 3 }}>{card.title}</div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 7, fontFamily: "monospace", color }}>{card.type}</span>
                    <span style={{ fontSize: 7, fontFamily: "monospace", color: "rgba(255,255,255,0.2)" }}>
                      {inQ ? "✓ queued" : "+ add"}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
          {/* Refresh */}
          <div style={{ padding: "8px 10px", borderTop: "1px solid rgba(255,255,255,0.05)", flexShrink: 0 }}>
            <button onClick={loadCanvas} style={{ width: "100%", background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.07)", borderRadius: 7, padding: "6px",
              color: "rgba(255,255,255,0.3)", fontSize: 9, fontFamily: "monospace", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
              <RefreshCw size={9}/>REFRESH CANVAS
            </button>
          </div>
        </div>

        {/* CENTRE: Execution queue + Gantt */}
        <div style={{ display: "flex", flexDirection: "column", overflow: "hidden", background: "#04060f" }}>
          {/* Gantt header */}
          <div style={{ padding: "12px 16px 8px", borderBottom: "1px solid rgba(255,255,255,0.05)", flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <Radio size={11} style={{ color: "#6366f1" }}/>
              <span style={{ fontSize: 9, fontFamily: "monospace", color: "rgba(165,180,252,0.6)", letterSpacing: "0.12em" }}>
                EXECUTION QUEUE — MAX {MAX_CONCURRENT} PARALLEL
              </span>
              {queue.length > 0 && (
                <button onClick={() => setQueue([])} style={{ marginLeft: "auto", background: "none",
                  border: "1px solid rgba(255,255,255,0.07)", borderRadius: 5, padding: "2px 8px",
                  color: "rgba(255,255,255,0.25)", fontSize: 8, fontFamily: "monospace", cursor: "pointer" }}>
                  Clear all
                </button>
              )}
            </div>
            {/* Concurrency lanes */}
            {runningCount > 0 && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 5 }}>
                {Array.from({ length: MAX_CONCURRENT }, (_, i) => {
                  const runningTasks = queue.filter(t => t.status === "running");
                  const task = runningTasks[i];
                  const color = task ? (TYPE_COLOR[task.card.type] || "#6366f1") : "rgba(255,255,255,0.05)";
                  return (
                    <div key={i} style={{ height: 4, borderRadius: 2, background: task ? color : "rgba(255,255,255,0.05)",
                      boxShadow: task ? "0 0 6px " + color : "none",
                      animation: task ? "laneActive 1s ease-in-out infinite alternate" : "none" }}/>
                  );
                })}
              </div>
            )}
          </div>
          {/* Task list */}
          <div style={{ flex: 1, overflow: "auto", padding: "10px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
            {queue.length === 0 ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                height: "100%", gap: 12, opacity: 0.4 }}>
                <Layers size={36} style={{ color: "rgba(99,102,241,0.4)" }}/>
                <div style={{ fontSize: 12, fontFamily: "monospace", color: "rgba(255,255,255,0.3)" }}>
                  NO TASKS QUEUED
                </div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", textAlign: "center", maxWidth: 280 }}>
                  Click cards on the left to add them to the queue, then hit RUN ALL to execute in parallel
                </div>
              </div>
            ) : (
              queue.map(task => (
                <TaskRow key={task.id} task={task} onCancel={removeFromQueue} onSave={saveTaskToDesk}/>
              ))
            )}
          </div>
        </div>

        {/* RIGHT: Brain chat */}
        <div style={{ borderLeft: "1px solid rgba(255,255,255,0.05)", display: "flex", flexDirection: "column",
          background: "rgba(3,5,15,0.9)" }}>
          <div style={{ padding: "10px 12px", borderBottom: "1px solid rgba(99,102,241,0.1)",
            background: "rgba(0,0,0,0.3)", flexShrink: 0 }}>
            <div style={{ fontSize: 9, fontFamily: "monospace", color: "#a5b4fc", fontWeight: 900 }}>MANAV BRAIN</div>
            <div style={{ fontSize: 7, color: "rgba(255,255,255,0.2)", fontFamily: "monospace" }}>
              {chatLoading ? "Thinking..." : "Command in plain English or voice"}
            </div>
          </div>
          {/* Chat messages */}
          <div style={{ flex: 1, overflow: "auto", padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
            {chatMsgs.map((m, i) => (
              <div key={i} style={{ display: "flex", flexDirection: "column",
                alignItems: m.role === "user" ? "flex-end" : "flex-start", gap: 2 }}>
                {m.role === "brain" && <span style={{ fontSize: 7, fontFamily: "monospace", color: "rgba(99,102,241,0.4)" }}>◈ BRAIN</span>}
                <div style={{ maxWidth: "90%", background: m.role === "user" ? "rgba(99,102,241,0.12)" : "rgba(255,255,255,0.02)",
                  border: m.role === "user" ? "1px solid rgba(99,102,241,0.2)" : "1px solid rgba(6,182,212,0.08)",
                  borderRadius: m.role === "user" ? "12px 12px 3px 12px" : "3px 12px 12px 12px",
                  padding: "8px 11px" }}>
                  <p style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", lineHeight: 1.6, margin: 0, whiteSpace: "pre-wrap" }}>
                    {m.text}
                    {m.role === "brain" && i === chatMsgs.length - 1 && chatLoading && (
                      <span style={{ animation: "blink 0.8s step-end infinite", color: "#6366f1", marginLeft: 2 }}>|</span>
                    )}
                  </p>
                </div>
              </div>
            ))}
            <div ref={chatBottomRef}/>
          </div>
          {/* Chat input */}
          <div style={{ padding: "8px 10px", borderTop: "1px solid rgba(255,255,255,0.04)", flexShrink: 0 }}>
            <div style={{ display: "flex", gap: 5 }}>
              <input value={chatIn} onChange={e => setChatIn(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(); } }}
                disabled={chatLoading} placeholder="Tell Brain what to do..."
                style={{ flex: 1, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)",
                  borderRadius: 7, padding: "6px 9px", fontSize: 10, color: "rgba(255,255,255,0.75)", outline: "none" }}/>
              <button onClick={toggleVoice} title={listening ? "Stop" : "Voice"}
                style={{ width: 28, height: 28, borderRadius: 7, border: "none", cursor: "pointer",
                  background: listening ? "rgba(239,68,68,0.18)" : "rgba(255,255,255,0.05)",
                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {listening ? <MicOff size={10} style={{ color: "#ef4444" }}/> : <Mic size={10} style={{ color: "rgba(255,255,255,0.3)" }}/>}
              </button>
              <button onClick={sendChat} disabled={chatLoading || !chatIn.trim()}
                style={{ width: 28, height: 28, borderRadius: 7, border: "none", cursor: "pointer", flexShrink: 0,
                  background: chatLoading || !chatIn.trim() ? "rgba(99,102,241,0.1)" : "linear-gradient(135deg,#6366f1,#4f46e5)",
                  display: "flex", alignItems: "center", justifyContent: "center" }}>
                {chatLoading ? <Loader2 size={10} style={{ color: "rgba(255,255,255,0.4)", animation: "spin 1s linear infinite" }}/> : <Send size={10} style={{ color: "white" }}/>}
              </button>
            </div>
            <div style={{ marginTop: 4, fontSize: 7, fontFamily: "monospace", color: "rgba(255,255,255,0.12)", textAlign: "center" }}>
              ENTER to send · voice supported · outputs auto-saved to Desk
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin { from{transform:rotate(0deg);}to{transform:rotate(360deg);} }
        @keyframes blink { 0%,100%{opacity:1;}50%{opacity:0;} }
        @keyframes progressPulse { 0%{opacity:0.6;width:30%;}50%{opacity:1;width:80%;}100%{opacity:0.6;width:30%;} }
        @keyframes laneActive { from{opacity:0.6;}to{opacity:1;} }
        input::placeholder { color: rgba(255,255,255,0.2); }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(99,102,241,0.25); border-radius: 2px; }
      `}</style>
    </div>
  );
}
