/* Vault — the client-intelligence brain.
   Ask anything about any client, read hourly/daily/weekly + on-demand reports
   (with an optional auto-refresh timer), get BDM coaching gaps, and build training
   tutorials from real client chats. Control how deep the analysis goes.
   Backend: bd_vault_ask / bd_vault_report / bd_vault_gaps / bd_vault_train. */
import { useState, useEffect, useRef } from "react";
import PortalNav from "@/components/PortalNav";
import ArtifactMarkdown from "@/components/pm/ArtifactMarkdown";
import { openStakeholderReport, downloadStakeholderAsWord } from "@/lib/reportExport";

async function post(action: string, body: any = {}) {
  const r = await fetch("/api/task-engine", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...body }) });
  return r.json();
}

type Msg = { role: "you" | "vault"; text: string; used?: string[] };
type RosterItem = { id?: string; client_name?: string; client_handle?: string };
const STATUSES = ["lead", "qualifying", "proposal", "negotiating", "demo_requested", "closing", "hired", "in_delivery", "repeat", "stalled", "lost"];

function ago(iso: string): string {
  const t = new Date(iso).getTime(); if (isNaN(t)) return "";
  const m = Math.round((Date.now() - t) / 60000);
  return m < 1 ? "just now" : m < 60 ? m + "m ago" : m < 1440 ? Math.round(m / 60) + "h ago" : Math.round(m / 1440) + "d ago";
}

function cap(s: string) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

// Compose a complete report document (numbers + narrative + named lead lists) as Markdown for export.
function reportToMarkdown(rep: any): string {
  const c = (rep.stats && rep.stats.counts) || {};
  const out: string[] = [];
  out.push(`**Snapshot (${rep.windowLabel}):** ${c.newLeads || 0} new · ${c.touched || 0} active in play · ${c.statusChanges || 0} status changes · ${c.won || 0} won · ${c.lost || 0} lost · ${c.active || 0} total active`);
  out.push("");
  out.push(rep.narrative || "");
  const sec = (title: string, arr: any[]) => {
    if (!arr || !arr.length) return;
    out.push("", `## ${title}`);
    for (const d of arr.slice(0, 20)) out.push(`- **${d.name}** — ${d.status}${d.country ? " · " + d.country : ""}${d.value ? " · $" + d.value : ""}${d.idleDays != null ? " · idle " + d.idleDays + "d" : ""}${d.next_move ? " — next: " + d.next_move : ""}`);
  };
  sec("Hanging leads", rep.stats && rep.stats.hanging);
  sec("At-risk leads", rep.stats && rep.stats.atRisk);
  sec("Hot leads", rep.stats && rep.stats.hot);
  return out.join("\n");
}

export default function Vault() {
  const [tab, setTab] = useState<"ask" | "reports" | "coaching" | "training" | "control">("ask");

  // ---- ask ----
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [asking, setAsking] = useState(false);
  const [client, setClient] = useState("");
  const [roster, setRoster] = useState<RosterItem[]>([]);
  const askEnd = useRef<HTMLDivElement>(null);

  // ---- reports ----
  const [kind, setKind] = useState<"hourly" | "daily" | "weekly">("daily");
  const [rStatus, setRStatus] = useState("all");
  const [rCountry, setRCountry] = useState("");
  const [rProblem, setRProblem] = useState("all");
  const [report, setReport] = useState<any>(null);
  const [repLoading, setRepLoading] = useState(false);

  // ---- coaching (BDM gaps) ----
  const [coach, setCoach] = useState<any>(null);
  const [coachLoading, setCoachLoading] = useState(false);
  const [coachStatus, setCoachStatus] = useState("all");

  // ---- training ----
  const [trainClient, setTrainClient] = useState("");
  const [train, setTrain] = useState<any>(null);
  const [trainLoading, setTrainLoading] = useState(false);

  // ---- control ----
  const [cfg, setCfg] = useState<{ depth: string; sections: string; auto: number }>({ depth: "standard", sections: "", auto: 0 });
  const [cfgSaved, setCfgSaved] = useState(false);

  useEffect(() => {
    post("bd_deal_list", { filter: "all" }).then((r) => { if (r && r.success && Array.isArray(r.deals)) setRoster(r.deals); }).catch(() => {});
    post("bd_settings_get", { key: "vault_config" }).then((r) => { if (r && r.success && r.value && typeof r.value === "object") setCfg({ depth: r.value.depth || "standard", sections: r.value.sections || "", auto: Number(r.value.auto) || 0 }); }).catch(() => {});
  }, []);
  useEffect(() => { if (askEnd.current) askEnd.current.scrollIntoView({ behavior: "smooth" }); }, [msgs, asking]);

  async function sendAsk() {
    const q = input.trim(); if (!q || asking) return;
    setInput("");
    const next: Msg[] = [...msgs, { role: "you", text: q }];
    setMsgs(next); setAsking(true);
    const history = next.slice(-6).map((m) => `${m.role === "you" ? "Operator" : "Vault"}: ${m.text}`).join("\n");
    try {
      const r = await post("bd_vault_ask", { question: q, client: client || undefined, history, config: cfg });
      if (r && r.success) setMsgs((m) => [...m, { role: "vault", text: r.answer || "(no answer)", used: r.used }]);
      else setMsgs((m) => [...m, { role: "vault", text: "Could not answer: " + ((r && r.error) || "unknown error") }]);
    } catch (e: any) { setMsgs((m) => [...m, { role: "vault", text: "Request failed: " + (e?.message || "network error") }]); }
    setAsking(false);
  }

  async function runReport(force = false, quiet = false) {
    if (repLoading && !quiet) return;
    if (!quiet) { setRepLoading(true); setReport(null); }
    try {
      const r = await post("bd_vault_report", { kind, scope: { status: rStatus, country: rCountry.trim(), problem: rProblem }, config: cfg, force });
      if (r && r.success) setReport(r.report);
      else if (!quiet) setReport({ error: (r && r.error) || "report failed" });
    } catch (e: any) { if (!quiet) setReport({ error: e?.message || "network error" }); }
    if (!quiet) setRepLoading(false);
  }

  async function saveCfg() {
    await post("bd_settings_set", { key: "vault_config", value: cfg });
    setCfgSaved(true); setTimeout(() => setCfgSaved(false), 1800);
  }

  function setAuto(min: number) {
    const n = { ...cfg, auto: min };
    setCfg(n);
    post("bd_settings_set", { key: "vault_config", value: n }).catch(() => {});
  }

  async function runCoach() {
    if (coachLoading) return;
    setCoachLoading(true); setCoach(null);
    try {
      const r = await post("bd_vault_gaps", { scope: { status: coachStatus }, config: cfg });
      setCoach(r && r.success ? r : { error: (r && r.error) || "analysis failed" });
    } catch (e: any) { setCoach({ error: e?.message || "network error" }); }
    setCoachLoading(false);
  }

  async function runTrain() {
    const who = trainClient.trim(); if (!who || trainLoading) return;
    setTrainLoading(true); setTrain(null);
    try {
      const r = await post("bd_vault_train", { client: who, config: cfg });
      setTrain(r && r.success ? r : { error: (r && r.error) || "could not build tutorial" });
    } catch (e: any) { setTrain({ error: e?.message || "network error" }); }
    setTrainLoading(false);
  }

  // auto-refresh: while Vault is open and a cadence is set, keep the current report warm (off = 0)
  const tickRef = useRef<() => void>(() => {});
  tickRef.current = () => { runReport(true, true); };
  useEffect(() => {
    if (!cfg.auto || cfg.auto <= 0) return;
    const id = setInterval(() => tickRef.current(), cfg.auto * 60000);
    return () => clearInterval(id);
  }, [cfg.auto]);

  const tabBtn = (id: typeof tab, label: string) => (
    <button onClick={() => setTab(id)} className={`px-4 py-2 text-sm font-semibold rounded-lg transition ${tab === id ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground border border-border"}`}>{label}</button>
  );

  const stats = report && report.stats ? report.stats : null;
  const c = stats ? stats.counts : null;

  const statCard = (label: string, val: number | string, tone = "") => (
    <div className="rounded-xl border border-border bg-card px-4 py-3">
      <div className={`text-2xl font-bold tabular-nums ${tone}`}>{val}</div>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground mt-0.5">{label}</div>
    </div>
  );

  const attentionList = (title: string, arr: any[], tone: string) => (
    arr && arr.length ? (
      <div className="rounded-xl border border-border bg-card p-4">
        <div className={`text-xs font-bold uppercase tracking-wider mb-2 ${tone}`}>{title} <span className="text-muted-foreground">({arr.length})</span></div>
        <div className="space-y-1.5">
          {arr.slice(0, 12).map((d, i) => (
            <div key={i} className="text-sm flex items-start justify-between gap-3 border-b border-border/50 pb-1.5 last:border-0">
              <div className="min-w-0">
                <span className="font-semibold">{d.name}</span>
                <span className="text-muted-foreground"> · {d.status}{d.country ? " · " + d.country : ""}{d.value ? " · $" + d.value : ""}{d.idleDays != null ? " · idle " + d.idleDays + "d" : ""}</span>
                {d.next_move ? <div className="text-[12px] text-muted-foreground mt-0.5">→ {d.next_move}</div> : null}
              </div>
            </div>
          ))}
        </div>
      </div>
    ) : null
  );

  const exportBar = (md: string, meta: { title: string; kind: string; generatedAt?: string }) => (
    <div className="flex gap-2 items-center">
      <button onClick={() => openStakeholderReport(md, meta)} title="Opens a print-ready, branded page — use your browser Print, then Save as PDF" className="px-3 py-1.5 rounded-lg bg-primary/90 text-primary-foreground text-xs font-semibold hover:bg-primary">Export PDF</button>
      <button onClick={() => downloadStakeholderAsWord(md, meta)} title="Download an editable Word document" className="px-3 py-1.5 rounded-lg bg-card border border-border text-xs text-muted-foreground hover:text-foreground">Word</button>
    </div>
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <PortalNav />
      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-2xl font-bold tracking-tight">Vault</h1>
          <span className="text-xs text-muted-foreground">Client intelligence · by Manav S</span>
        </div>
        <p className="text-sm text-muted-foreground mb-5">Ask anything about any client, read hourly / daily / weekly and on-demand reports across your Fiverr activity, and set how deep the analysis goes. Grounded only in your real lead data.</p>

        <div className="flex gap-2 mb-5 flex-wrap">{tabBtn("ask", "Ask")}{tabBtn("reports", "Reports")}{tabBtn("coaching", "Coaching")}{tabBtn("training", "Training")}{tabBtn("control", "Control")}</div>

        {/* ============ ASK ============ */}
        {tab === "ask" && (
          <div className="rounded-2xl border border-border bg-card/40 p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs text-muted-foreground">Scope:</span>
              <select value={client} onChange={(e) => setClient(e.target.value)} className="bg-card border border-border rounded-lg px-3 py-1.5 text-sm">
                <option value="">All clients (population)</option>
                {roster.map((d, i) => <option key={i} value={d.client_handle || d.client_name || ""}>{d.client_name || d.client_handle}</option>)}
              </select>
              <span className="text-[11px] text-muted-foreground">or just name a client in your question</span>
              {msgs.length ? <div className="ml-auto">{exportBar(msgs.map((m) => m.role === "you" ? `## Q: ${m.text}` : m.text + (m.used && m.used.length ? `\n\n*Source: ${m.used.join(", ")}*` : "")).join("\n\n---\n\n"), { title: "Vault — Conversation", kind: "Client Intelligence Q&A", generatedAt: new Date().toISOString() })}</div> : null}
            </div>

            <div className="min-h-[320px] max-h-[52vh] overflow-y-auto space-y-3 mb-3 pr-1">
              {msgs.length === 0 && (
                <div className="text-sm text-muted-foreground p-4">
                  Ask things like: <em>"What is the status of luisberisha and what is my next move?"</em> · <em>"Which US leads are hot right now?"</em> · <em>"Who has gone quiet for over a week?"</em> · <em>"Summarise every negotiating deal and the money at stake."</em>
                </div>
              )}
              {msgs.map((m, i) => (
                <div key={i} className={`flex ${m.role === "you" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${m.role === "you" ? "bg-primary text-primary-foreground whitespace-pre-wrap" : "bg-card border border-border"}`}>
                    {m.role === "vault" ? <ArtifactMarkdown body={m.text} size="sm" /> : m.text}
                    {m.used && m.used.length ? <div className="text-[11px] mt-2 opacity-70">on: {m.used.join(", ")}</div> : null}
                  </div>
                </div>
              ))}
              {asking && <div className="flex justify-start"><div className="rounded-2xl px-4 py-2.5 text-sm bg-card border border-border text-muted-foreground">Reading the data…</div></div>}
              <div ref={askEnd} />
            </div>

            <div className="flex gap-2">
              <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendAsk(); } }}
                placeholder="Ask Vault about any client…" className="flex-1 bg-card border border-border rounded-xl px-4 py-2.5 text-sm" />
              <button onClick={() => sendAsk()} disabled={asking || !input.trim()} className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50">Ask</button>
            </div>
          </div>
        )}

        {/* ============ REPORTS ============ */}
        {tab === "reports" && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-border bg-card/40 p-4 flex flex-wrap items-end gap-3">
              <div className="flex gap-1.5">
                {(["hourly", "daily", "weekly"] as const).map((k) => (
                  <button key={k} onClick={() => setKind(k)} className={`px-3 py-1.5 text-sm rounded-lg capitalize ${kind === k ? "bg-primary text-primary-foreground" : "bg-card border border-border text-muted-foreground"}`}>{k}</button>
                ))}
              </div>
              <div>
                <label className="block text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Status</label>
                <select value={rStatus} onChange={(e) => setRStatus(e.target.value)} className="bg-card border border-border rounded-lg px-3 py-1.5 text-sm">
                  <option value="all">All</option>{STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Country</label>
                <input value={rCountry} onChange={(e) => setRCountry(e.target.value)} placeholder="any" className="bg-card border border-border rounded-lg px-3 py-1.5 text-sm w-28" />
              </div>
              <div>
                <label className="block text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Focus</label>
                <select value={rProblem} onChange={(e) => setRProblem(e.target.value)} className="bg-card border border-border rounded-lg px-3 py-1.5 text-sm">
                  <option value="all">In play</option><option value="hanging">Hanging</option><option value="at_risk">At risk</option><option value="hot">Hot</option>
                </select>
              </div>
              <button onClick={() => runReport(false)} disabled={repLoading} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50">{repLoading ? "Preparing…" : "View report"}</button>
              <button onClick={() => runReport(true)} disabled={repLoading} className="px-3 py-2 rounded-lg bg-card border border-border text-sm text-muted-foreground disabled:opacity-50">Refresh</button>
            </div>

            <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
              <span>Auto-refresh while open:</span>
              {[0, 15, 30, 60, 180].map((min) => (
                <button key={min} onClick={() => setAuto(min)} className={`px-2.5 py-1 rounded-md border text-[12px] ${cfg.auto === min ? "bg-primary text-primary-foreground border-transparent" : "bg-card border-border"}`}>{min === 0 ? "Off" : min < 60 ? min + "m" : min / 60 + "h"}</button>
              ))}
              {cfg.auto > 0 ? <span className="text-[11px]">keeps the current report fresh every {cfg.auto < 60 ? cfg.auto + " min" : cfg.auto / 60 + "h"} — only while this page is open</span> : null}
            </div>

            {report && report.error && <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm">{report.error}</div>}

            {report && !report.error && (
              <>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="text-xs text-muted-foreground">{report.windowLabel} · {report.cached ? "prepared " + ago(report.generated_at) : "generated " + ago(report.generated_at)}{cfg.auto > 0 ? " · auto every " + (cfg.auto < 60 ? cfg.auto + "m" : cfg.auto / 60 + "h") : ""}</div>
                  {exportBar(reportToMarkdown(report), { title: cap(report.kind || "Daily") + " Report", kind: "Vault Report", generatedAt: report.generated_at })}
                </div>
                {c && (
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                    {statCard("New leads", c.newLeads, "text-emerald-400")}
                    {statCard("Active in play", c.touched)}
                    {statCard("Status changes", c.statusChanges)}
                    {statCard("Won", c.won, "text-emerald-400")}
                    {statCard("Lost", c.lost, "text-rose-400")}
                    {statCard("Total active", c.active)}
                  </div>
                )}
                <div className="rounded-2xl border border-border bg-card p-5"><ArtifactMarkdown body={report.narrative} /></div>
                <div className="grid md:grid-cols-3 gap-3">
                  {attentionList("Hanging", stats.hanging, "text-amber-400")}
                  {attentionList("At risk", stats.atRisk, "text-rose-400")}
                  {attentionList("Hot", stats.hot, "text-emerald-400")}
                </div>
                {stats && (stats.byCountry?.length || stats.byStatus?.length) ? (
                  <div className="grid md:grid-cols-2 gap-3">
                    <div className="rounded-xl border border-border bg-card p-4">
                      <div className="text-xs font-bold uppercase tracking-wider mb-2 text-muted-foreground">Active by status</div>
                      {stats.byStatus.map((x: any, i: number) => <div key={i} className="flex justify-between text-sm py-0.5"><span>{x.key}</span><span className="tabular-nums text-muted-foreground">{x.count}</span></div>)}
                    </div>
                    <div className="rounded-xl border border-border bg-card p-4">
                      <div className="text-xs font-bold uppercase tracking-wider mb-2 text-muted-foreground">Active by country</div>
                      {stats.byCountry.map((x: any, i: number) => <div key={i} className="flex justify-between text-sm py-0.5"><span>{x.key}</span><span className="tabular-nums text-muted-foreground">{x.count}</span></div>)}
                    </div>
                  </div>
                ) : null}
              </>
            )}
            {!report && !repLoading && <div className="text-sm text-muted-foreground p-4">Pick a window and filters, then View report. Reports are prepared and cached per window — instant when fresh, regenerated on demand with Refresh.</div>}
          </div>
        )}

        {/* ============ COACHING ============ */}
        {tab === "coaching" && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-border bg-card/40 p-4 flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Status filter</label>
                <select value={coachStatus} onChange={(e) => setCoachStatus(e.target.value)} className="bg-card border border-border rounded-lg px-3 py-1.5 text-sm">
                  <option value="all">All leads</option>{STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <button onClick={() => runCoach()} disabled={coachLoading} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50">{coachLoading ? "Reading the chats…" : "Analyse handling"}</button>
              <span className="text-[11px] text-muted-foreground">Reads recent conversations and finds what the team is missing and what to correct.</span>
            </div>
            {coach && coach.error && <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm">{coach.error}</div>}
            {coach && !coach.error && (
              <>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="text-xs text-muted-foreground">Reviewed {coach.count} recent conversation{coach.count === 1 ? "" : "s"}</div>
                  {exportBar(`Reviewed ${coach.count} recent conversation${coach.count === 1 ? "" : "s"}.\n\n${coach.analysis}`, { title: "Team Coaching — Handling Analysis", kind: "Vault Coaching", generatedAt: new Date().toISOString() })}
                </div>
                <div className="rounded-2xl border border-border bg-card p-5"><ArtifactMarkdown body={coach.analysis} /></div>
              </>
            )}
            {!coach && !coachLoading && <div className="text-sm text-muted-foreground p-4">Analyse handling to see the recurring gaps across your BDM conversations — slow first response, ignored buying signals, no clear next step, missed upsells, weak objection handling — each grounded in the real chats, with the fix.</div>}
          </div>
        )}

        {/* ============ TRAINING ============ */}
        {tab === "training" && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-border bg-card/40 p-4 flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Build from client</label>
                <input list="vault-roster" value={trainClient} onChange={(e) => setTrainClient(e.target.value)} placeholder="type or pick a client" className="bg-card border border-border rounded-lg px-3 py-1.5 text-sm w-64" />
                <datalist id="vault-roster">{roster.map((d, i) => <option key={i} value={d.client_name || d.client_handle || ""} />)}</datalist>
              </div>
              <button onClick={() => runTrain()} disabled={trainLoading || !trainClient.trim()} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50">{trainLoading ? "Building tutorial…" : "Build tutorial"}</button>
              <span className="text-[11px] text-muted-foreground">Turns one real client chat (and call, if on file) into an annotated training walkthrough.</span>
            </div>
            {train && train.error && <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm">{train.error}</div>}
            {train && !train.error && (
              <>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="text-xs text-muted-foreground">Tutorial from {train.client}{train.hasCall ? " · chat + call" : " · chat (no call transcript on file)"}</div>
                  {exportBar(train.tutorial, { title: "Training Tutorial — " + train.client, kind: "Vault Training", generatedAt: new Date().toISOString() })}
                </div>
                <div className="rounded-2xl border border-border bg-card p-5"><ArtifactMarkdown body={train.tutorial} /></div>
              </>
            )}
            {!train && !trainLoading && <div className="text-sm text-muted-foreground p-4">Name a real client and Vault builds a training tutorial from their actual conversation — the scenario, the key moments quoted, what was handled well, what was missed, the better move, and the principle — for chat and call.</div>}
          </div>
        )}

        {/* ============ CONTROL ============ */}
        {tab === "control" && (
          <div className="rounded-2xl border border-border bg-card/40 p-5 max-w-xl space-y-5">
            <div>
              <label className="block text-sm font-semibold mb-2">Analysis depth</label>
              <div className="flex gap-2">
                {(["brief", "standard", "deep"] as const).map((d) => (
                  <button key={d} onClick={() => setCfg({ ...cfg, depth: d })} className={`px-4 py-2 text-sm rounded-lg capitalize ${cfg.depth === d ? "bg-primary text-primary-foreground" : "bg-card border border-border text-muted-foreground"}`}>{d}</button>
                ))}
              </div>
              <p className="text-[12px] text-muted-foreground mt-2">Controls how much every answer and report covers. Brief = the headline only. Deep = every relevant lead, the evidence, and the actions.</p>
            </div>
            <div>
              <label className="block text-sm font-semibold mb-2">Emphasis (optional)</label>
              <textarea value={cfg.sections} onChange={(e) => setCfg({ ...cfg, sections: e.target.value })} rows={3} placeholder="e.g. always flag money at stake, prioritise US and UK leads, call out anything I have not replied to in 48h"
                className="w-full bg-card border border-border rounded-xl px-3 py-2 text-sm" />
              <p className="text-[12px] text-muted-foreground mt-2">Free text. Vault folds this into every report so the analysis follows what matters to you.</p>
            </div>
            <div>
              <label className="block text-sm font-semibold mb-2">Auto-refresh reports</label>
              <div className="flex gap-2 flex-wrap">
                {[0, 15, 30, 60, 180].map((min) => (
                  <button key={min} onClick={() => setCfg({ ...cfg, auto: min })} className={`px-4 py-2 text-sm rounded-lg ${cfg.auto === min ? "bg-primary text-primary-foreground" : "bg-card border border-border text-muted-foreground"}`}>{min === 0 ? "Off" : min < 60 ? min + " min" : min / 60 + " hour"}</button>
                ))}
              </div>
              <p className="text-[12px] text-muted-foreground mt-2">When on, Vault keeps the current report regenerated on this cadence so it is ready when you look — but only while this page is open (Vercel Hobby has no background scheduler). For a report waiting for you 24/7 with the page closed, point an external scheduler at the bd_vault_report endpoint.</p>
            </div>
            <button onClick={() => saveCfg()} className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold">{cfgSaved ? "Saved ✓" : "Save controls"}</button>
            <p className="text-[12px] text-muted-foreground">These controls apply to Ask, Reports, Coaching and Training. Per-BDM (per-person) attribution would need an owner field on deals — today Coaching is team-wide and Training is per-client.</p>
          </div>
        )}
      </div>
    </div>
  );
}
