/* Build 12.41 — Deal Workspace (Fiverr chat simulator) with smart merge.
   Paste new messages (or the whole chat) — it dedupes against what is
   already there, adds only what is new, re-analyses, and shows the next
   move + ready reply inline. Failures are now visible, not silent.
   Project-independent. */
import { useState, useEffect } from "react";
import PortalNav from "@/components/PortalNav";

/* Parse the pasted conversation into chat turns (client vs seller) without
   asking the model to echo it. Handles "Me: …" labels and the Fiverr
   name / timestamp / message block format. */
function parseThread(text: string): Array<{ sender: string; text: string }> {
  const raw = (text || "").trim();
  if (!raw) return [];
  const lines = raw.split(/\n/).map(l => l.trim()).filter(Boolean);
  const tsRe = /\d{1,2}:\d{2}\s*[ap]\.?\s*m\.?/i;                              // 9:53 PM
  const dateRe = /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}/i; // May 06,...
  const avatarRe = /^[A-Za-z]$/;                                              // single-letter avatar
  const noiseRe = /^(profile image|promoted|replied|video call ended|read more|read less|order details|delivered)$/i;
  const dropRe = /^duration:|call recording is ready|did something happen on the call|report the incident/i;
  const isTime = (l: string) => tsRe.test(l) || dateRe.test(l);

  const turns: Array<{ sender: string; text: string }> = [];
  let cur: { sender: string; text: string } | null = null;
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (avatarRe.test(l)) {                  // new turn header begins
      let sender = "client";
      i++;
      while (i < lines.length && !isTime(lines[i])) { if (/^me$/i.test(lines[i])) sender = "seller"; i++; }
      while (i < lines.length && isTime(lines[i])) i++;   // skip date/time
      cur = { sender, text: "" }; turns.push(cur);
      continue;
    }
    if (noiseRe.test(l) || dropRe.test(l) || isTime(l)) { i++; continue; }
    if (cur) cur.text += (cur.text ? "\n" : "") + l;
    else { cur = { sender: "client", text: l }; turns.push(cur); }
    i++;
  }
  const out = turns.filter(t => t.text.trim()).map(t => ({ sender: t.sender, text: t.text.trim() }));
  /* Fallbacks for non-Fiverr pastes: inline "Speaker: msg". */
  if (out.length <= 1 && /\n/.test(raw) && /^([A-Za-z0-9_.\- ]{1,40}):\s+/m.test(raw)) {
    const seller = /^(me|seller|manav)\b/i;
    const inline: Array<{ sender: string; text: string }> = [];
    let c: { sender: string; text: string } | null = null;
    for (const ln of lines) {
      const m = ln.match(/^([A-Za-z0-9_.\- ]{1,40}):\s+(.*)$/);
      if (m) { c = { sender: seller.test(m[1]) ? "seller" : "client", text: m[2].trim() }; inline.push(c); }
      else if (c) c.text += "\n" + ln;
    }
    if (inline.length > 1) return inline.filter(t => t.text.trim());
  }
  return out.length ? out : [{ sender: "client", text: raw }];
}

async function post(action: string, body: any = {}) {
  const r = await fetch("/api/task-engine", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...body }) });
  return r.json().catch(() => ({}));
}

const stageColor = (s: string) => ["hired", "repeat", "in_delivery"].includes(s) ? "#10b981" : s === "lost" ? "#ef4444" : s === "stalled" ? "#64748b" : "#6366f1";
const tempColor = (t: string) => t === "hot" ? "#ef4444" : t === "warm" ? "#f59e0b" : "#64748b";
const Chip = ({ text, color }: { text: string; color: string }) => (
  <span className="text-[11px] px-2 py-0.5 rounded-md border" style={{ color, borderColor: color + "55", background: color + "11" }}>{text}</span>
);

/* Merge pasted text into the existing thread, dropping duplicates and
   keeping only genuinely new lines. Handles re-pasting the whole chat. */
function mergeConversation(existing: string, pasted: string): string {
  const ex = (existing || "").trim(); const pa = (pasted || "").trim();
  if (!pa) return ex;
  if (!ex) return pa;
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  const nEx = norm(ex); const nPa = norm(pa);
  if (nEx.includes(nPa)) return ex;     // already fully present
  if (nPa.includes(nEx)) return pa;     // pasted is a fuller version → use it
  const exLines = new Set(ex.split(/\n+/).map(norm).filter(Boolean));
  const newLines = pasted.split(/\n+/).filter(l => l.trim() && !exLines.has(norm(l)));
  if (!newLines.length) return ex;      // nothing new
  return ex + "\n" + newLines.join("\n");
}

export default function Deals() {
  const [deals, setDeals] = useState<any[]>([]);
  const [filter, setFilter] = useState("active");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<any>(null);
  const [conversation, setConversation] = useState("");
  const [pasteInput, setPasteInput] = useState("");
  const [strategy, setStrategy] = useState<any>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [autoAnalyse, setAutoAnalyse] = useState(true);
  const [lastAnalysed, setLastAnalysed] = useState("");
  const [showRaw, setShowRaw] = useState(false);
  const [showDetail, setShowDetail] = useState(true);
  const [transcript, setTranscript] = useState("");
  const [showAttach, setShowAttach] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [confirmDel, setConfirmDel] = useState(false);

  const loadList = async () => { const r: any = await post("bd_deal_list", { status: filter, search }); if (r?.success) setDeals(r.deals || []); else if (r?.error) setError(r.error); };
  useEffect(() => { loadList(); /* eslint-disable-next-line */ }, [filter]);

  const openDeal = async (id: string) => {
    setError(""); setNotice(""); setBusy("open");
    const r: any = await post("bd_deal_get", { id });
    setBusy("");
    if (!r?.success) { setError(r?.error || "Could not open the deal."); return; }
    const d = r.deal;
    setSelected(d); setConversation(d.conversation || ""); setStrategy(d.strategy || null); setPasteInput(""); setLastAnalysed(d.conversation || "");
    setTags(Array.isArray(d.tags) ? d.tags : []); setConfirmDel(false);
  };

  const newDeal = () => { setSelected(null); setConversation(""); setPasteInput(""); setStrategy(null); setError(""); setNotice(""); setLastAnalysed(""); setTags([]); setConfirmDel(false); };

  const saveTags = async (next: string[]) => {
    setTags(next);
    if (selected?.id) { const r: any = await post("bd_deal_update", { id: selected.id, tags: next }); if (r?.deal) setSelected(r.deal); loadList(); }
  };
  const addTag = () => { const t = tagInput.trim().toLowerCase(); if (t && !tags.includes(t)) saveTags([...tags, t]); setTagInput(""); };
  const removeTag = (t: string) => saveTags(tags.filter(x => x !== t));

  const archiveDeal = async () => {
    if (!selected?.id) return;
    await post("bd_deal_update", { id: selected.id, status: "archived" });
    setNotice("Lead archived."); newDeal(); loadList();
  };
  const deleteDeal = async () => {
    if (!selected?.id) { newDeal(); return; }
    const r: any = await post("bd_deal_delete", { id: selected.id });
    if (!r?.success) { setError(r?.error || "Could not delete."); return; }
    setNotice("Lead deleted."); newDeal(); loadList();
  };

  const runStrategize = async (convo: string, auto = false) => {
    if (!convo.trim()) return;
    if (busy === "strategize") return;
    setBusy("strategize"); setError(""); setNotice(auto ? "Analysing…" : "");
    try {
      let id = selected?.id;
      const save: any = await post("bd_deal_save", { id, client_name: selected?.client_name || "Untitled lead", conversation: convo });
      if (save?.success && save.deal) { setSelected(save.deal); id = save.deal.id; }
      else if (!save?.success && save?.error) { /* keep going — strategise can run without persistence */ }
      const r: any = await post("bd_strategize", { id, conversation: convo });
      setLastAnalysed(convo);
      if (!r?.success || !r?.strategy) { setError(r?.error || "Could not analyse this time — tap Analyse to retry."); return; }
      setStrategy(r.strategy); setNotice(""); loadList();
    } catch (e: any) {
      setError(e?.message || "Analysis failed — tap Analyse to retry.");
    } finally {
      setBusy("");
    }
  };

  const addAndAnalyse = async (auto = false) => {
    const merged = mergeConversation(conversation, pasteInput);
    if (!merged.trim()) { if (!auto) setError("Paste the conversation first."); return; }
    if (merged === conversation) { setNotice("Already in the chat — nothing new to add."); setPasteInput(""); return; }
    setConversation(merged); setPasteInput("");
    await runStrategize(merged, auto);
  };

  const attach = async (name: string, kind: string, text: string) => {
    if (!text.trim()) { setError("No readable text to attach — images need their text pasted."); return; }
    setError(""); setBusy("attach");
    let id = selected?.id;
    if (!id) { const s: any = await post("bd_deal_save", { client_name: selected?.client_name || "Untitled lead", conversation }); if (s?.success) { setSelected(s.deal); id = s.deal.id; } }
    if (!id) { setBusy(""); setError("Could not save the deal to attach to."); return; }
    const r: any = await post("bd_deal_attach", { id, name, kind, text });
    setBusy("");
    if (!r?.success) { setError(r?.error || "Could not attach."); return; }
    setSelected(r.deal); setNotice(`Added ${kind}: ${name}. Re-analysing with it…`);
    runStrategize(conversation || text, false);
  };
  const attachFile = async (file: File | undefined) => { if (!file) return; try { attach(file.name, "file", await file.text()); } catch { setError("Could not read the file (text formats only for now)."); } };

  /* Auto-analyse a pasted chunk ~2s after you stop. */
  useEffect(() => {
    if (!autoAnalyse || !pasteInput.trim() || busy === "strategize") return;
    const t = setTimeout(() => { addAndAnalyse(true); }, 2000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pasteInput, autoAnalyse]);

  const copy = (t: string) => { try { navigator.clipboard.writeText(t); } catch { /* ignore */ } };

  const clientName = strategy?.detected_client || selected?.client_name || "New lead";
  const clientSite = strategy?.client_site || "";
  const messages = parseThread(conversation);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <PortalNav />
      <div className="max-w-7xl mx-auto px-4 py-6 grid grid-cols-1 md:grid-cols-[300px_1fr] gap-6">

        {/* Left — deals */}
        <div className="rounded-2xl border border-border bg-card p-4 h-fit">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold">Deals</h2>
            <button onClick={newDeal} className="text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground font-semibold hover:opacity-90">+ New</button>
          </div>
          <input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === "Enter" && loadList()}
            placeholder="Search…" className="w-full px-3 py-2 rounded-lg border border-border bg-background text-xs outline-none focus:border-primary mb-2" />
          <div className="flex gap-1 mb-3">
            {["active", "won", "archived", "all"].map(f => (
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
                {Array.isArray(d.tags) && d.tags.length > 0 && <div className="flex flex-wrap gap-1 mt-1">{d.tags.slice(0, 4).map((t: string) => <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{t}</span>)}</div>}
              </button>
            ))}
          </div>
        </div>

        {/* Right — chat simulator */}
        <div className="rounded-2xl border border-border bg-card flex flex-col min-h-[80vh]">
          <div className="flex items-center gap-2 px-5 py-3 border-b border-border">
            <div className="w-8 h-8 rounded-full bg-primary/15 text-primary flex items-center justify-center text-sm font-bold">{(clientName || "?").slice(0, 1).toUpperCase()}</div>
            <div className="font-semibold text-sm">{clientName}</div>
            {strategy?.deal_state?.stage && <Chip text={strategy.deal_state.stage} color={stageColor(strategy.deal_state.stage)} />}
            {strategy?.deal_state?.temperature && <Chip text={strategy.deal_state.temperature} color={tempColor(strategy.deal_state.temperature)} />}
            {clientSite && <a href={`/wizard?client=${encodeURIComponent(clientSite)}`} className="ml-auto text-[11px] px-2.5 py-1 rounded-md bg-primary/10 text-primary border border-primary/30">Build demo for {clientSite} →</a>}
          </div>

          {selected?.id && (
            <div className="flex flex-wrap items-center gap-2 px-5 py-2 border-b border-border">
              {tags.map(t => (
                <span key={t} className="text-[11px] px-2 py-0.5 rounded-md bg-muted border border-border flex items-center gap-1">{t}<button onClick={() => removeTag(t)} className="text-muted-foreground hover:text-foreground">×</button></span>
              ))}
              <input value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={e => e.key === "Enter" && addTag()} placeholder="+ tag"
                className="w-24 px-2 py-0.5 rounded-md border border-border bg-background text-[11px] outline-none focus:border-primary" />
              <button onClick={archiveDeal} className="ml-auto text-[11px] px-2.5 py-1 rounded-md border border-border text-muted-foreground hover:border-primary">Archive</button>
              {confirmDel ? (
                <span className="text-[11px] flex items-center gap-2">
                  <button onClick={deleteDeal} className="px-2.5 py-1 rounded-md border" style={{ color: "#ef4444", borderColor: "#ef444455", background: "#ef444411" }}>Confirm delete</button>
                  <button onClick={() => setConfirmDel(false)} className="text-muted-foreground">cancel</button>
                </span>
              ) : (
                <button onClick={() => setConfirmDel(true)} className="text-[11px] px-2.5 py-1 rounded-md border border-border text-muted-foreground hover:opacity-80" style={{ borderColor: "#ef444455" }}>Delete</button>
              )}
            </div>
          )}

          {error && <div className="mx-5 mt-3 rounded-xl border p-3 text-xs" style={{ color: "#ef4444", borderColor: "#ef444455", background: "#ef444411" }}>{error}</div>}
          {notice && !error && <div className="mx-5 mt-3 text-[11px] text-primary">{notice}</div>}

          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
            {messages.length === 0 && <p className="text-xs text-muted-foreground text-center py-10">Paste the client conversation below — the client, stage, next move and a ready reply appear here automatically.</p>}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.sender === "seller" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[78%] px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap ${m.sender === "seller" ? "bg-primary/10 rounded-br-sm" : "bg-muted rounded-bl-sm"}`}>{m.text}</div>
              </div>
            ))}

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
                    {strategy.reminders?.length > 0 && (
                      <div className="rounded-lg border p-2" style={{ borderColor: "#6366f155", background: "#6366f111" }}>
                        <span className="font-semibold" style={{ color: "#6366f1" }}>Reminders:</span>
                        <ul className="list-disc ml-4 text-muted-foreground">{strategy.reminders.map((r: any, i: number) => <li key={i}>{r.text}{r.when ? <span className="text-foreground/70"> — {r.when}</span> : null}</li>)}</ul>
                      </div>
                    )}
                    {strategy.risk_flags?.length > 0 && (
                      <div className="rounded-lg border p-2" style={{ borderColor: "#f59e0b55", background: "#f59e0b11" }}>
                        <span className="font-semibold" style={{ color: "#f59e0b" }}>Watch out:</span>
                        <ul className="list-disc ml-4 text-muted-foreground">{strategy.risk_flags.map((r: string, i: number) => <li key={i}>{r}</li>)}</ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* attachments — prompted by the chat, kept on the deal, fed into the strategy */}
          {(strategy || selected) && (
            <div className="border-t border-border px-5 py-3 space-y-2">
              {strategy?.needs_attachments?.length > 0 && (
                <div className="rounded-xl border p-2 text-xs" style={{ borderColor: "#6366f155", background: "#6366f111" }}>
                  <span className="font-semibold" style={{ color: "#6366f1" }}>📎 The chat references these — add them so I can use them:</span>
                  <ul className="list-disc ml-4 text-muted-foreground">{strategy.needs_attachments.map((a: any, i: number) => <li key={i}>{a.what}{a.note ? ` — ${a.note}` : ""}</li>)}</ul>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-[11px] px-2.5 py-1 rounded-md bg-primary/10 text-primary border border-primary/30 cursor-pointer">
                  {busy === "attach" ? "Adding…" : "+ Add file"}
                  <input type="file" accept=".txt,.md,.markdown,.csv,.tsv,.json,.html,.htm,.log,.xml,.yaml,.yml" className="hidden" onChange={e => attachFile(e.target.files?.[0])} disabled={busy === "attach"} />
                </label>
                <button onClick={() => setShowAttach(v => !v)} className="text-[11px] px-2.5 py-1 rounded-md bg-primary/10 text-primary border border-primary/30">+ Add call transcript</button>
                {(selected?.attachments || []).map((a: any, i: number) => <Chip key={i} text={`📎 ${a.name}`} color="#10b981" />)}
              </div>
              {showAttach && (
                <div>
                  <textarea value={transcript} onChange={e => setTranscript(e.target.value)} placeholder="Paste the call transcript or document text here (Fiverr call recordings expire after ~30 days — save it now)…"
                    className="w-full h-24 px-3 py-2 rounded-lg border border-border bg-background text-xs outline-none focus:border-primary resize-y" />
                  <button onClick={() => { if (transcript.trim()) { attach("call transcript", "transcript", transcript); setTranscript(""); setShowAttach(false); } }} disabled={busy === "attach" || !transcript.trim()} className="mt-1 text-[11px] px-3 py-1.5 rounded-lg bg-primary text-primary-foreground disabled:opacity-50">Add transcript</button>
                </div>
              )}
            </div>
          )}

          {/* paste / append box */}
          <div className="border-t border-border p-3">
            <textarea value={pasteInput} onChange={e => { setPasteInput(e.target.value); setNotice(""); }}
              placeholder="Paste new messages here (or the whole chat). Duplicates are ignored — only new lines are added."
              className="w-full h-24 px-3 py-2 rounded-xl border border-border bg-background text-sm outline-none focus:border-primary resize-y" />
            <div className="flex items-center gap-3 mt-2">
              <button onClick={() => addAndAnalyse(false)} disabled={busy === "strategize" || !pasteInput.trim()} className="text-xs px-4 py-2 rounded-lg bg-primary text-primary-foreground font-semibold disabled:opacity-50">
                {busy === "strategize" ? "Analysing…" : "Add & analyse"}
              </button>
              <button onClick={() => setShowRaw(v => !v)} className="text-[11px] text-muted-foreground underline">{showRaw ? "Hide" : "View/edit"} full thread</button>
              <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground ml-auto">
                <input type="checkbox" checked={autoAnalyse} onChange={e => setAutoAnalyse(e.target.checked)} />
                Auto-analyse on paste
              </label>
            </div>
            {showRaw && (
              <div className="mt-2">
                <textarea value={conversation} onChange={e => setConversation(e.target.value)}
                  className="w-full h-32 px-3 py-2 rounded-xl border border-border bg-background text-xs outline-none focus:border-primary resize-y" />
                <button onClick={() => runStrategize(conversation, false)} disabled={busy === "strategize"} className="mt-1 text-[11px] px-3 py-1.5 rounded-lg bg-primary/10 text-primary border border-primary/30">Re-analyse full thread</button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
