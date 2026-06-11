/* Build 12.40 — Deal Workspace as a Fiverr-style chat simulator.
   Paste the conversation; the client, stage, and everything else are
   detected automatically, and the suggested reply + strategy appear
   inline in the thread. No forms, no manual fields. Switch/search deals
   on the left. */
import { useState, useEffect } from "react";
import PortalNav from "@/components/PortalNav";
import { useProject } from "@/contexts/ProjectContext";

async function post(action: string, body: any = {}) {
  const r = await fetch("/api/task-engine", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...body }) });
  return r.json().catch(() => ({}));
}

const stageColor = (s: string) => ["hired", "repeat", "in_delivery"].includes(s) ? "#10b981" : s === "lost" ? "#ef4444" : s === "stalled" ? "#64748b" : "#6366f1";
const tempColor = (t: string) => t === "hot" ? "#ef4444" : t === "warm" ? "#f59e0b" : "#64748b";
const Chip = ({ text, color }: { text: string; color: string }) => (
  <span className="text-[11px] px-2 py-0.5 rounded-md border" style={{ color, borderColor: color + "55", background: color + "11" }}>{text}</span>
);

export default function Deals() {
  const proj = useProject() as any;
  const projectId = proj?.selectedProjectId || (typeof localStorage !== "undefined" ? localStorage.getItem("seo_season_proj") : "") || "";

  const [deals, setDeals] = useState<any[]>([]);
  const [filter, setFilter] = useState("active");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<any>(null);
  const [conversation, setConversation] = useState("");
  const [strategy, setStrategy] = useState<any>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [autoStrategize, setAutoStrategize] = useState(true);
  const [userEdited, setUserEdited] = useState(false);
  const [lastStrategized, setLastStrategized] = useState("");
  const [showDetail, setShowDetail] = useState(true);

  const loadList = async () => { const r: any = await post("bd_deal_list", { status: filter, search }); if (r?.success) setDeals(r.deals || []); };
  useEffect(() => { loadList(); /* eslint-disable-next-line */ }, [filter]);

  const openDeal = async (id: string) => {
    setError(""); setBusy("open");
    const r: any = await post("bd_deal_get", { id });
    setBusy("");
    if (!r?.success) { setError(r?.error || "Could not open the deal."); return; }
    const d = r.deal;
    setSelected(d); setConversation(d.conversation || ""); setStrategy(d.strategy || null);
    setUserEdited(false); setLastStrategized(d.conversation || "");
  };

  const newDeal = () => { setSelected(null); setConversation(""); setStrategy(null); setError(""); setUserEdited(false); setLastStrategized(""); };

  const strategize = async (auto = false) => {
    if (!conversation.trim()) { if (!auto) setError("Paste the client conversation first."); return; }
    if (busy === "strategize") return;
    setBusy("strategize"); setError("");
    let id = selected?.id;
    if (!id) { const s: any = await post("bd_deal_save", { client_name: "Untitled lead", conversation, projectId }); if (s?.success) { setSelected(s.deal); id = s.deal.id; } }
    else { await post("bd_deal_save", { id, conversation, projectId }); }
    const r: any = await post("bd_strategize", { id, conversation });
    setBusy(""); setLastStrategized(conversation);
    if (!r?.strategy) { if (!auto) setError(r?.error || "Could not strategise."); return; }
    setStrategy(r.strategy);
    loadList();
  };

  /* Auto-strategise once you stop pasting (debounced), never on load or unchanged text. */
  useEffect(() => {
    if (!autoStrategize || !userEdited) return;
    if (!conversation.trim() || conversation === lastStrategized || busy === "strategize") return;
    const t = setTimeout(() => { strategize(true); }, 2000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation, autoStrategize, userEdited]);

  const copy = (t: string) => { try { navigator.clipboard.writeText(t); } catch { /* ignore */ } };

  const clientName = strategy?.detected_client || selected?.client_name || "New lead";
  const messages: any[] = strategy?.messages || [];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <PortalNav />
      <div className="max-w-7xl mx-auto px-4 py-6 grid grid-cols-1 md:grid-cols-[300px_1fr] gap-6">

        {/* Left — deals (switch / search) */}
        <div className="rounded-2xl border border-border bg-card p-4 h-fit">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold">Deals</h2>
            <button onClick={newDeal} className="text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground font-semibold hover:opacity-90">+ New</button>
          </div>
          <input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === "Enter" && loadList()}
            placeholder="Search…" className="w-full px-3 py-2 rounded-lg border border-border bg-background text-xs outline-none focus:border-primary mb-2" />
          <div className="flex gap-1 mb-3">
            {["active", "won", "all"].map(f => (
              <button key={f} onClick={() => setFilter(f)} className={`text-[11px] px-2.5 py-1 rounded-md border ${filter === f ? "bg-primary/15 text-primary border-primary/40" : "border-border text-muted-foreground"}`}>{f === "won" ? "Hired" : f[0].toUpperCase() + f.slice(1)}</button>
            ))}
          </div>
          <div className="space-y-1.5 max-h-[72vh] overflow-y-auto">
            {deals.length === 0 && <p className="text-xs text-muted-foreground py-4 text-center">No deals yet. Click + New and paste a chat.</p>}
            {deals.map(d => (
              <button key={d.id} onClick={() => openDeal(d.id)}
                className={`w-full text-left px-3 py-2 rounded-lg border ${selected?.id === d.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold truncate">{d.client_name || "Untitled"}</span>
                  <Chip text={d.status} color={stageColor(d.status)} />
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Right — chat simulator */}
        <div className="rounded-2xl border border-border bg-card flex flex-col min-h-[80vh]">
          {/* header */}
          <div className="flex items-center gap-2 px-5 py-3 border-b border-border">
            <div className="w-8 h-8 rounded-full bg-primary/15 text-primary flex items-center justify-center text-sm font-bold">{(clientName || "?").slice(0, 1).toUpperCase()}</div>
            <div className="font-semibold text-sm">{clientName}</div>
            {strategy?.deal_state?.stage && <Chip text={strategy.deal_state.stage} color={stageColor(strategy.deal_state.stage)} />}
            {strategy?.deal_state?.temperature && <Chip text={strategy.deal_state.temperature} color={tempColor(strategy.deal_state.temperature)} />}
            {busy === "strategize" && <span className="text-[11px] text-primary ml-auto">analysing…</span>}
          </div>

          {error && <div className="mx-5 mt-3 rounded-xl border p-3 text-xs" style={{ color: "#ef4444", borderColor: "#ef444455", background: "#ef444411" }}>{error}</div>}

          {/* thread */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
            {messages.length === 0 && <p className="text-xs text-muted-foreground text-center py-10">Paste the client conversation below — the client, the stage, the next move and a ready reply will appear here automatically.</p>}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.sender === "seller" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[78%] px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap ${m.sender === "seller" ? "bg-primary/10 rounded-br-sm" : "bg-muted rounded-bl-sm"}`}>{m.text}</div>
              </div>
            ))}

            {/* inline suggested reply */}
            {strategy?.draft_reply && (
              <div className="flex justify-end">
                <div className="max-w-[80%] rounded-2xl rounded-br-sm border border-primary/40 bg-primary/5 p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-semibold text-primary uppercase tracking-wider">Suggested reply</span>
                    <button onClick={() => copy(strategy.draft_reply)} className="text-[11px] px-2 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/30">Copy</button>
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{strategy.draft_reply}</p>
                </div>
              </div>
            )}

            {/* inline strategy */}
            {strategy && (strategy.next_move || strategy.risk_flags?.length || strategy.call_script?.needed) && (
              <div className="rounded-xl border border-border bg-background/60 p-3 text-xs space-y-2">
                <button onClick={() => setShowDetail(v => !v)} className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{showDetail ? "▾" : "▸"} Strategy</button>
                {showDetail && (
                  <div className="space-y-2">
                    {strategy.next_move && <p><span className="font-semibold text-primary">Next move:</span> {strategy.next_move}</p>}
                    {strategy.deal_state?.summary && <p className="text-muted-foreground">{strategy.deal_state.summary}</p>}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {([["Wants", strategy.client_intel?.wants], ["Pain points", strategy.client_intel?.pain_points], ["Buying signals", strategy.client_intel?.buying_signals], ["Objections", strategy.client_intel?.objections]] as [string, string[]][]).map(([label, items]) => (items?.length ? (
                        <div key={label}><span className="font-semibold text-muted-foreground">{label}:</span><ul className="list-disc ml-4 text-muted-foreground">{items.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
                      ) : null))}
                    </div>
                    {strategy.action_items?.length > 0 && (
                      <div><span className="font-semibold text-muted-foreground">Do now:</span><ul className="list-disc ml-4 text-muted-foreground">{strategy.action_items.map((a: any, i: number) => <li key={i}>{a.action}{a.platform_can_help && <Chip text="platform can do this" color="#10b981" />}</li>)}</ul></div>
                    )}
                    {strategy.call_script?.needed && (
                      <div className="rounded-lg border border-border p-2">
                        <span className="font-semibold text-muted-foreground">Call script</span>
                        {strategy.call_script.opening && <p className="mt-1"><b>Open:</b> {strategy.call_script.opening}</p>}
                        {strategy.call_script.discovery_questions?.length > 0 && <div><b>Ask:</b><ul className="list-disc ml-4 text-muted-foreground">{strategy.call_script.discovery_questions.map((q: string, i: number) => <li key={i}>{q}</li>)}</ul></div>}
                        {strategy.call_script.objection_handling?.length > 0 && <div><b>Objections:</b><ul className="list-disc ml-4 text-muted-foreground">{strategy.call_script.objection_handling.map((q: string, i: number) => <li key={i}>{q}</li>)}</ul></div>}
                        {strategy.call_script.close && <p><b>Close:</b> {strategy.call_script.close}</p>}
                      </div>
                    )}
                    {strategy.risk_flags?.length > 0 && (
                      <div className="rounded-lg border p-2" style={{ borderColor: "#f59e0b55", background: "#f59e0b11" }}>
                        <span className="font-semibold" style={{ color: "#f59e0b" }}>Watch out:</span>
                        <ul className="list-disc ml-4 text-muted-foreground">{strategy.risk_flags.map((r: string, i: number) => <li key={i}>{r}</li>)}</ul>
                      </div>
                    )}
                    <a href="/wizard" className="inline-block text-[11px] text-primary underline">Open Wizard for a demo audit / deliverable</a>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* paste box */}
          <div className="border-t border-border p-3">
            <textarea value={conversation} onChange={e => { setConversation(e.target.value); setUserEdited(true); }}
              placeholder="Paste the full Fiverr conversation here (or the latest message). It updates automatically."
              className="w-full h-24 px-3 py-2 rounded-xl border border-border bg-background text-sm outline-none focus:border-primary resize-y" />
            <div className="flex items-center gap-3 mt-2">
              {!autoStrategize && <button onClick={() => strategize(false)} disabled={busy === "strategize"} className="text-xs px-4 py-2 rounded-lg bg-primary text-primary-foreground font-semibold disabled:opacity-50">{busy === "strategize" ? "Analysing…" : "Analyse"}</button>}
              <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground ml-auto">
                <input type="checkbox" checked={autoStrategize} onChange={e => setAutoStrategize(e.target.checked)} />
                Auto-analyse on paste
              </label>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
