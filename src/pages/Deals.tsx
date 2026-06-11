/* Build 12.39 — Deal Workspace (Fiverr conversion + BDM).
   Paste the running client conversation, strategise the next move, get a
   ready reply and a call script, keep notes, and switch/search between
   leads and hired clients — all inline, no context-switching. */
import { useState, useEffect } from "react";
import PortalNav from "@/components/PortalNav";
import { useProject } from "@/contexts/ProjectContext";

async function post(action: string, body: any = {}) {
  const r = await fetch("/api/task-engine", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...body }) });
  return r.json().catch(() => ({}));
}

const STAGES = ["lead", "qualifying", "proposal", "negotiating", "demo_requested", "closing", "hired", "in_delivery", "repeat", "stalled", "lost"];
const TEMP_COLOR: Record<string, string> = { hot: "#ef4444", warm: "#f59e0b", cold: "#64748b" };
const stageColor = (s: string) => ["hired", "repeat", "in_delivery"].includes(s) ? "#10b981" : s === "lost" ? "#ef4444" : s === "stalled" ? "#64748b" : "#6366f1";

export default function Deals() {
  const proj = useProject() as any;
  const projectId = proj?.selectedProjectId || (typeof localStorage !== "undefined" ? localStorage.getItem("seo_season_proj") : "") || "";

  const [deals, setDeals] = useState<any[]>([]);
  const [filter, setFilter] = useState("active");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<any>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  // editable fields
  const [clientName, setClientName] = useState("");
  const [brief, setBrief] = useState("");
  const [conversation, setConversation] = useState("");
  const [status, setStatus] = useState("lead");
  const [notes, setNotes] = useState("");
  const [strategy, setStrategy] = useState<any>(null);

  const loadList = async () => {
    const r: any = await post("bd_deal_list", { status: filter, search });
    if (r?.success) setDeals(r.deals || []);
  };
  useEffect(() => { loadList(); /* eslint-disable-next-line */ }, [filter]);

  const openDeal = async (id: string) => {
    setError(""); setBusy("open");
    const r: any = await post("bd_deal_get", { id });
    setBusy("");
    if (!r?.success) { setError(r?.error || "Could not open the deal."); return; }
    const d = r.deal;
    setSelected(d); setClientName(d.client_name || ""); setBrief(d.brief || ""); setConversation(d.conversation || ""); setStatus(d.status || "lead"); setNotes(d.notes || ""); setStrategy(d.strategy || null);
  };

  const newDeal = () => { setSelected(null); setClientName(""); setBrief(""); setConversation(""); setStatus("lead"); setNotes(""); setStrategy(null); setError(""); };

  const save = async () => {
    setBusy("save"); setError("");
    const r: any = await post("bd_deal_save", { id: selected?.id, client_name: clientName || "Untitled lead", brief, conversation, status, notes, projectId });
    setBusy("");
    if (!r?.success) { setError(r?.error || "Save failed (did you run the bd_deals migration?)."); return; }
    setSelected(r.deal); loadList();
  };

  const strategize = async () => {
    if (!conversation.trim()) { setError("Paste the client conversation first."); return; }
    setBusy("strategize"); setError("");
    // save first so the strategy persists to the deal
    let id = selected?.id;
    if (!id) { const s: any = await post("bd_deal_save", { client_name: clientName || "Untitled lead", brief, conversation, status, notes, projectId }); if (s?.success) { setSelected(s.deal); id = s.deal.id; } }
    else { await post("bd_deal_save", { id, client_name: clientName, brief, conversation, status, notes, projectId }); }
    const r: any = await post("bd_strategize", { id, conversation, brief, client_name: clientName });
    setBusy("");
    if (!r?.strategy && !r?.success) { setError(r?.error || "Could not strategise."); return; }
    setStrategy(r.strategy);
    if (r.strategy?.deal_state?.stage && STAGES.includes(r.strategy.deal_state.stage)) setStatus(r.strategy.deal_state.stage);
    loadList();
  };

  const copy = (t: string) => { try { navigator.clipboard.writeText(t); } catch { /* ignore */ } };

  const Chip = ({ text, color }: { text: string; color: string }) => (
    <span className="text-[11px] px-2 py-0.5 rounded-md border" style={{ color, borderColor: color + "55", background: color + "11" }}>{text}</span>
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <PortalNav />
      <div className="max-w-7xl mx-auto px-4 py-6 grid grid-cols-1 md:grid-cols-[320px_1fr] gap-6">

        {/* Left — deal list */}
        <div className="rounded-2xl border border-border bg-card p-4 h-fit">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold">Deals</h2>
            <button onClick={newDeal} className="text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground font-semibold hover:opacity-90">+ New</button>
          </div>
          <input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === "Enter" && loadList()}
            placeholder="Search name / brief / chat…" className="w-full px-3 py-2 rounded-lg border border-border bg-background text-xs outline-none focus:border-primary mb-2" />
          <div className="flex gap-1 mb-3">
            {["active", "won", "all"].map(f => (
              <button key={f} onClick={() => setFilter(f)} className={`text-[11px] px-2.5 py-1 rounded-md border ${filter === f ? "bg-primary/15 text-primary border-primary/40" : "border-border text-muted-foreground"}`}>{f === "won" ? "Hired" : f[0].toUpperCase() + f.slice(1)}</button>
            ))}
          </div>
          <div className="space-y-1.5 max-h-[70vh] overflow-y-auto">
            {deals.length === 0 && <p className="text-xs text-muted-foreground py-4 text-center">No deals yet. Click + New.</p>}
            {deals.map(d => (
              <button key={d.id} onClick={() => openDeal(d.id)}
                className={`w-full text-left px-3 py-2 rounded-lg border ${selected?.id === d.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold truncate">{d.client_name || "Untitled"}</span>
                  <Chip text={d.status} color={stageColor(d.status)} />
                </div>
                {d.brief && <div className="text-[11px] text-muted-foreground truncate mt-0.5">{d.brief.slice(0, 80)}</div>}
              </button>
            ))}
          </div>
        </div>

        {/* Right — deal detail */}
        <div className="space-y-4">
          {error && <div className="rounded-xl border p-3 text-xs" style={{ color: "#ef4444", borderColor: "#ef444455", background: "#ef444411" }}>{error}</div>}

          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="flex flex-wrap items-center gap-3 mb-3">
              <input value={clientName} onChange={e => setClientName(e.target.value)} placeholder="Client name / handle"
                className="flex-1 min-w-[200px] px-3 py-2 rounded-lg border border-border bg-background text-sm font-semibold outline-none focus:border-primary" />
              <select value={status} onChange={e => setStatus(e.target.value)} className="px-3 py-2 rounded-lg border border-border bg-background text-xs outline-none">
                {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <button onClick={save} disabled={busy === "save"} className="text-xs px-4 py-2 rounded-lg bg-primary/10 text-primary border border-primary/30 hover:bg-primary/20 disabled:opacity-50">{busy === "save" ? "Saving…" : "Save"}</button>
            </div>
            <textarea value={brief} onChange={e => setBrief(e.target.value)} placeholder="The client's brief / what they asked for…"
              className="w-full h-20 px-3 py-2 rounded-lg border border-border bg-background text-xs outline-none focus:border-primary resize-y mb-3" />
            <div className="text-xs font-semibold text-muted-foreground mb-1 uppercase tracking-wider">Conversation (paste their messages and yours as it goes)</div>
            <textarea value={conversation} onChange={e => setConversation(e.target.value)} placeholder={"Client: Hi, I need SEO + AEO for my Shopify store…\nMe: …"}
              className="w-full h-48 px-3 py-2 rounded-lg border border-border bg-background text-sm outline-none focus:border-primary resize-y" />
            <div className="flex flex-wrap gap-2 mt-3">
              <button onClick={strategize} disabled={busy === "strategize"} className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-50">
                {busy === "strategize" ? "Strategising…" : "Strategise next move"}
              </button>
              <a href="/wizard" className="px-4 py-2.5 rounded-xl text-sm border border-border text-muted-foreground hover:border-primary">Open Wizard (demo audit / deliverable)</a>
            </div>
          </div>

          {/* Strategy */}
          {strategy && (
            <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Chip text={`Stage: ${strategy.deal_state?.stage}`} color={stageColor(strategy.deal_state?.stage)} />
                {strategy.deal_state?.temperature && <Chip text={strategy.deal_state.temperature} color={TEMP_COLOR[strategy.deal_state.temperature] || "#64748b"} />}
              </div>
              {strategy.deal_state?.summary && <p className="text-sm text-muted-foreground">{strategy.deal_state.summary}</p>}

              {strategy.next_move && (
                <div className="rounded-xl border border-primary/30 bg-primary/5 p-3">
                  <div className="text-[11px] font-semibold text-primary uppercase tracking-wider mb-1">Next best move</div>
                  <p className="text-sm">{strategy.next_move}</p>
                </div>
              )}

              {strategy.draft_reply && (
                <div className="rounded-xl border border-border p-3">
                  <div className="flex items-center justify-between mb-1">
                    <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Ready reply</div>
                    <button onClick={() => copy(strategy.draft_reply)} className="text-[11px] px-2 py-1 rounded-md bg-primary/10 text-primary border border-primary/30">Copy</button>
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{strategy.draft_reply}</p>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                {([["What they want", strategy.client_intel?.wants], ["Pain points", strategy.client_intel?.pain_points], ["Buying signals", strategy.client_intel?.buying_signals], ["Objections", strategy.client_intel?.objections]] as [string, string[]][]).map(([label, items]) => (items?.length ? (
                  <div key={label}><div className="font-semibold text-muted-foreground mb-1">{label}</div><ul className="list-disc ml-4 text-muted-foreground space-y-0.5">{items.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
                ) : null))}
              </div>

              {strategy.action_items?.length > 0 && (
                <div>
                  <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Action items</div>
                  <ul className="space-y-1">{strategy.action_items.map((a: any, i: number) => (
                    <li key={i} className="text-xs"><span className="font-medium">{a.action}</span>{a.platform_can_help && <Chip text="platform can do this" color="#10b981" />} <span className="text-muted-foreground">— {a.why}</span></li>
                  ))}</ul>
                </div>
              )}

              {strategy.call_script?.needed && (
                <div className="rounded-xl border border-border p-3">
                  <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Call script</div>
                  {strategy.call_script.opening && <p className="text-xs mb-2"><span className="font-semibold">Open:</span> {strategy.call_script.opening}</p>}
                  {strategy.call_script.discovery_questions?.length > 0 && <div className="text-xs mb-2"><span className="font-semibold">Ask:</span><ul className="list-disc ml-4 text-muted-foreground">{strategy.call_script.discovery_questions.map((q: string, i: number) => <li key={i}>{q}</li>)}</ul></div>}
                  {strategy.call_script.value_points?.length > 0 && <div className="text-xs mb-2"><span className="font-semibold">Value:</span><ul className="list-disc ml-4 text-muted-foreground">{strategy.call_script.value_points.map((q: string, i: number) => <li key={i}>{q}</li>)}</ul></div>}
                  {strategy.call_script.objection_handling?.length > 0 && <div className="text-xs mb-2"><span className="font-semibold">Objections:</span><ul className="list-disc ml-4 text-muted-foreground">{strategy.call_script.objection_handling.map((q: string, i: number) => <li key={i}>{q}</li>)}</ul></div>}
                  {strategy.call_script.close && <p className="text-xs"><span className="font-semibold">Close:</span> {strategy.call_script.close}</p>}
                </div>
              )}

              {strategy.risk_flags?.length > 0 && (
                <div className="rounded-xl border p-3" style={{ borderColor: "#f59e0b55", background: "#f59e0b11" }}>
                  <div className="text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: "#f59e0b" }}>Watch out</div>
                  <ul className="list-disc ml-4 text-xs text-muted-foreground">{strategy.risk_flags.map((r: string, i: number) => <li key={i}>{r}</li>)}</ul>
                </div>
              )}
            </div>
          )}

          {/* Notes */}
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Notes</div>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} onBlur={save} placeholder="Your notes on this deal…"
              className="w-full h-24 px-3 py-2 rounded-lg border border-border bg-background text-xs outline-none focus:border-primary resize-y" />
          </div>
        </div>
      </div>
    </div>
  );
}
