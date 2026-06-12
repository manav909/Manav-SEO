/* Build 12.44 — Deal Workspace as an advanced Fiverr-style 3-pane console.
   Left: conversations. Center: chat thread + composer (with the AI's
   suggested reply). Right: the Advanced Intelligence panel (deal state,
   client intel, next move, action items, call script, reminders, risks,
   attachments, demo, lead management). Paste only the chat — the rest is
   derived. Project-independent. */
import { useState, useEffect } from "react";
import PortalNav from "@/components/PortalNav";

/* Best-effort client name/handle from the pasted chat (so leads are never
   left "Untitled"). The strategist refines it; this is the deterministic
   fallback that names the lead immediately. */
function detectClientName(text: string): string {
  const lines = (text || "").split(/\n/).map(l => l.trim()).filter(Boolean);
  const isTs = (l: string) => /\d{1,2}:\d{2}\s*[ap]\.?\s*m\.?|^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}/i.test(l);
  const noise = /^(profile image|promoted|replied|me|read more|read less)$/i;
  for (let i = 0; i < lines.length; i++) {
    if (/^[A-Za-z]$/.test(lines[i])) {
      const n = lines[i + 1];
      if (n && !noise.test(n) && !isTs(n) && !/^[A-Za-z]$/.test(n)) return n.slice(0, 60);
    }
  }
  const m = (text || "").match(/^(?!me\b|seller\b)([A-Za-z0-9_.\- ]{2,40}):\s+/im);
  return m ? m[1].trim().slice(0, 60) : "";
}

function parseThread(text: string): Array<{ sender: string; text: string }> {
  const raw = (text || "").trim();
  if (!raw) return [];
  const lines = raw.split(/\n/).map(l => l.trim()).filter(Boolean);
  const tsRe = /\d{1,2}:\d{2}\s*[ap]\.?\s*m\.?/i;
  const dateRe = /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}/i;
  const avatarRe = /^[A-Za-z]$/;
  const noiseRe = /^(profile image|promoted|replied|video call ended|read more|read less|order details|delivered)$/i;
  const dropRe = /^duration:|call recording is ready|did something happen on the call|report the incident/i;
  const isTime = (l: string) => tsRe.test(l) || dateRe.test(l);
  const turns: Array<{ sender: string; text: string }> = [];
  let cur: { sender: string; text: string } | null = null;
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (avatarRe.test(l)) {
      let sender = "client"; i++;
      while (i < lines.length && !isTime(lines[i])) { if (/^me$/i.test(lines[i])) sender = "seller"; i++; }
      while (i < lines.length && isTime(lines[i])) i++;
      cur = { sender, text: "" }; turns.push(cur); continue;
    }
    if (noiseRe.test(l) || dropRe.test(l) || isTime(l)) { i++; continue; }
    if (cur) cur.text += (cur.text ? "\n" : "") + l; else { cur = { sender: "client", text: l }; turns.push(cur); }
    i++;
  }
  const out = turns.filter(t => t.text.trim()).map(t => ({ sender: t.sender, text: t.text.trim() }));
  if (out.length <= 1 && /^([A-Za-z0-9_.\- ]{1,40}):\s+/m.test(raw)) {
    const seller = /^(me|seller|manav)\b/i; const inline: Array<{ sender: string; text: string }> = []; let c: any = null;
    for (const ln of lines) { const m = ln.match(/^([A-Za-z0-9_.\- ]{1,40}):\s+(.*)$/); if (m) { c = { sender: seller.test(m[1]) ? "seller" : "client", text: m[2].trim() }; inline.push(c); } else if (c) c.text += "\n" + ln; }
    if (inline.length > 1) return inline.filter(t => t.text.trim());
  }
  return out.length ? out : [{ sender: "client", text: raw }];
}

async function post(action: string, body: any = {}) {
  const r = await fetch("/api/task-engine", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...body }) });
  return r.json().catch(() => ({}));
}

const stageColor = (s: string) => ["hired", "repeat", "in_delivery"].includes(s) ? "#10b981" : s === "lost" ? "#ef4444" : s === "stalled" || s === "archived" ? "#64748b" : "#6366f1";
const tempColor = (t: string) => t === "hot" ? "#ef4444" : t === "warm" ? "#f59e0b" : "#64748b";
const Chip = ({ text, color }: { text: string; color: string }) => (<span className="text-[11px] px-2 py-0.5 rounded-md border" style={{ color, borderColor: color + "55", background: color + "11" }}>{text}</span>);
const Section = ({ title, children }: { title: string; children: any }) => (<div className="mb-4"><div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">{title}</div>{children}</div>);
const List = ({ items }: { items: string[] }) => (<ul className="list-disc ml-4 text-xs text-muted-foreground space-y-0.5">{items.map((x, i) => <li key={i}>{x}</li>)}</ul>);

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
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [confirmDel, setConfirmDel] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [showAttach, setShowAttach] = useState(false);
  const [replyDraft, setReplyDraft] = useState("");
  const [audit, setAudit] = useState<any>(null);
  const [auditing, setAuditing] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({ next: true, client: true, actions: true });
  const [nameInput, setNameInput] = useState("");
  const toggle = (k: string) => setOpen(o => ({ ...o, [k]: !o[k] }));

  const loadList = async () => { const r: any = await post("bd_deal_list", { status: filter, search }); if (r?.success) setDeals(r.deals || []); else if (r?.error) setError(r.error); };
  useEffect(() => { loadList(); /* eslint-disable-next-line */ }, [filter]);

  const applyStrategy = (s: any) => { setStrategy(s); setReplyDraft(s?.draft_reply || ""); };

  const openDeal = async (id: string) => {
    setError(""); setNotice(""); setBusy("open");
    const r: any = await post("bd_deal_get", { id });
    setBusy("");
    if (!r?.success) { setError(r?.error || "Could not open the deal."); return; }
    const d = r.deal;
    setSelected(d); setConversation(d.conversation || ""); applyStrategy(d.strategy || null); setPasteInput(""); setLastAnalysed(d.conversation || "");
    setTags(Array.isArray(d.tags) ? d.tags : []); setConfirmDel(false); setAudit(null); setNameInput(d.client_name || "");
  };
  const newDeal = () => { setSelected(null); setConversation(""); setPasteInput(""); applyStrategy(null); setError(""); setNotice(""); setLastAnalysed(""); setTags([]); setConfirmDel(false); setAudit(null); setNameInput(""); };

  const renameDeal = async (name: string) => {
    const n = name.trim(); if (!selected?.id || !n) return;
    const r: any = await post("bd_deal_update", { id: selected.id, client_name: n });
    if (r?.deal) setSelected(r.deal); loadList();
  };

  const runAudit = async () => {
    if (!clientSite) { setError("No client site detected. Add the client's URL in the chat first."); return; }
    setAuditing(true); setError(""); setOpen(o => ({ ...o, audit: true }));
    const r: any = await post("bd_run_audit", { siteUrl: clientSite, id: selected?.id });
    setAuditing(false);
    if (!r?.report) { setError(r?.error || "Could not run the audit."); return; }
    setAudit(r.report);
    if (r?.report && selected?.id) { try { const g: any = await post("bd_deal_get", { id: selected.id }); if (g?.deal) setSelected(g.deal); } catch { /* ignore */ } }
  };

  const runStrategize = async (convo: string, auto = false) => {
    if (!convo.trim() || busy === "strategize") return;
    setBusy("strategize"); setError(""); setNotice(auto ? "Analysing…" : "");
    try {
      let id = selected?.id;
      const nm = selected?.client_name && selected.client_name !== "Untitled lead" ? selected.client_name : (detectClientName(convo) || "Untitled lead");
      const save: any = await post("bd_deal_save", { id, client_name: nm, conversation: convo });
      if (save?.success && save.deal) { setSelected(save.deal); id = save.deal.id; setNameInput(save.deal.client_name || nm); }
      const r: any = await post("bd_strategize", { id, conversation: convo });
      setLastAnalysed(convo);
      if (!r?.success || !r?.strategy) { setError(r?.error || "Could not analyse this time — tap Analyse to retry."); return; }
      applyStrategy(r.strategy); setNotice(""); loadList();
    } catch (e: any) { setError(e?.message || "Analysis failed — tap Analyse to retry."); }
    finally { setBusy(""); }
  };

  const mergeConversation = (existing: string, pasted: string): string => {
    const ex = (existing || "").trim(); const pa = (pasted || "").trim();
    if (!pa) return ex; if (!ex) return pa;
    const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
    if (norm(ex).includes(norm(pa))) return ex;
    if (norm(pa).includes(norm(ex))) return pa;
    const exLines = new Set(ex.split(/\n+/).map(norm).filter(Boolean));
    const newLines = pasted.split(/\n+/).filter(l => l.trim() && !exLines.has(norm(l)));
    return newLines.length ? ex + "\n" + newLines.join("\n") : ex;
  };
  const addAndAnalyse = async (auto = false) => {
    const merged = mergeConversation(conversation, pasteInput);
    if (!merged.trim()) { if (!auto) setError("Paste the conversation first."); return; }
    if (merged === conversation) { setNotice("Already in the chat — nothing new."); setPasteInput(""); return; }
    setConversation(merged); setPasteInput(""); await runStrategize(merged, auto);
  };
  useEffect(() => {
    if (!autoAnalyse || !pasteInput.trim() || busy === "strategize") return;
    const t = setTimeout(() => { addAndAnalyse(true); }, 2000); return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pasteInput, autoAnalyse]);

  const attach = async (name: string, kind: string, text: string) => {
    if (!text.trim()) { setError("No readable text to attach — images need their text pasted."); return; }
    setError(""); setBusy("attach");
    let id = selected?.id;
    if (!id) { const s: any = await post("bd_deal_save", { client_name: selected?.client_name || "Untitled lead", conversation }); if (s?.success) { setSelected(s.deal); id = s.deal.id; } }
    if (!id) { setBusy(""); setError("Could not save the deal to attach to."); return; }
    const r: any = await post("bd_deal_attach", { id, name, kind, text }); setBusy("");
    if (!r?.success) { setError(r?.error || "Could not attach."); return; }
    setSelected(r.deal); setNotice(`Added ${kind}: ${name}. Re-analysing…`); runStrategize(conversation || text, false);
  };
  const attachFile = async (file: File | undefined) => { if (!file) return; try { attach(file.name, "file", await file.text()); } catch { setError("Could not read the file (text formats only)."); } };

  const saveTags = async (next: string[]) => { setTags(next); if (selected?.id) { const r: any = await post("bd_deal_update", { id: selected.id, tags: next }); if (r?.deal) setSelected(r.deal); loadList(); } };
  const addTag = () => { const t = tagInput.trim().toLowerCase(); if (t && !tags.includes(t)) saveTags([...tags, t]); setTagInput(""); };
  const removeTag = (t: string) => saveTags(tags.filter(x => x !== t));
  const archiveDeal = async () => { if (!selected?.id) return; await post("bd_deal_update", { id: selected.id, status: "archived" }); setNotice("Lead archived."); newDeal(); loadList(); };
  const deleteDeal = async () => { if (!selected?.id) { newDeal(); return; } const r: any = await post("bd_deal_delete", { id: selected.id }); if (!r?.success) { setError(r?.error || "Could not delete."); return; } newDeal(); loadList(); };
  const copy = (t: string) => { try { navigator.clipboard.writeText(t); } catch { /* ignore */ } };

  const launchDemo = () => {
    try {
      sessionStorage.setItem("wizard_restore", JSON.stringify({
        chatText: conversation || "",
        clientSiteUrl: clientSite ? `https://${clientSite}/` : "",
        noGsc: true,
      }));
    } catch { /* ignore */ }
    window.location.href = "/wizard";
  };

  const Acc = ({ k, title, children, defaultBadge }: { k: string; title: string; children: any; defaultBadge?: any }) => (
    <div className="border-b border-border">
      <button onClick={() => toggle(k)} className="w-full flex items-center justify-between py-2.5 text-left">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{title}{defaultBadge != null && <span className="ml-1.5 text-primary normal-case">{defaultBadge}</span>}</span>
        <span className="text-muted-foreground text-xs">{open[k] ? "▾" : "▸"}</span>
      </button>
      {open[k] && <div className="pb-3">{children}</div>}
    </div>
  );

  const clientName = strategy?.detected_client || selected?.client_name || "New lead";
  const clientSite = strategy?.client_site || "";
  const messages = parseThread(conversation);
  const intel = strategy?.client_intel || {};

  return (
    <div className="min-h-screen bg-background text-foreground">
      <PortalNav />
      <div className="max-w-[1700px] mx-auto px-3 py-4 grid grid-cols-1 lg:grid-cols-[270px_1fr_350px] gap-4 h-[calc(100vh-90px)]">

        {/* LEFT — conversations */}
        <div className="rounded-2xl border border-border bg-card p-3 flex flex-col min-h-0">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-bold">All conversations</h2>
            <button onClick={newDeal} className="text-xs px-2.5 py-1 rounded-lg bg-primary text-primary-foreground font-semibold hover:opacity-90">+ New</button>
          </div>
          <input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === "Enter" && loadList()} placeholder="Search…" className="w-full px-3 py-1.5 rounded-lg border border-border bg-background text-xs outline-none focus:border-primary mb-2" />
          <div className="flex gap-1 mb-2 flex-wrap">
            {["active", "won", "archived", "all"].map(f => (<button key={f} onClick={() => setFilter(f)} className={`text-[11px] px-2 py-0.5 rounded-md border ${filter === f ? "bg-primary/15 text-primary border-primary/40" : "border-border text-muted-foreground"}`}>{f === "won" ? "Hired" : f[0].toUpperCase() + f.slice(1)}</button>))}
          </div>
          <div className="space-y-1 overflow-y-auto flex-1 min-h-0">
            {deals.length === 0 && <p className="text-xs text-muted-foreground py-4 text-center">No deals yet. + New, then paste a chat.</p>}
            {deals.map(d => (
              <div key={d.id}>
                <button onClick={() => openDeal(d.id)} className={`w-full text-left px-2.5 py-2 rounded-lg border flex gap-2 ${selected?.id === d.id ? "border-primary bg-primary/5 rounded-b-none" : "border-border hover:border-primary/40"}`}>
                  <div className="w-8 h-8 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-xs font-bold shrink-0">{(d.client_name || "?").slice(0, 1).toUpperCase()}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1"><span className="text-xs font-semibold truncate">{d.client_name || "Untitled"}</span><span className="text-[10px]" style={{ color: stageColor(d.status) }}>{d.status}</span></div>
                    {Array.isArray(d.tags) && d.tags.length > 0 && <div className="flex flex-wrap gap-1 mt-0.5">{d.tags.slice(0, 3).map((t: string) => <span key={t} className="text-[9px] px-1 py-0.5 rounded bg-muted text-muted-foreground">{t}</span>)}</div>}
                  </div>
                </button>
                {selected?.id === d.id && (
                  <div className="px-2.5 py-2 rounded-b-lg border border-t-0 border-primary bg-primary/5 space-y-2">
                    <input value={nameInput} onChange={e => setNameInput(e.target.value)} onBlur={() => renameDeal(nameInput)} onKeyDown={e => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                      placeholder="Lead name" className="w-full px-2 py-1 rounded-md border border-border bg-background text-xs outline-none focus:border-primary" />
                    <div className="flex flex-wrap items-center gap-1">
                      {tags.map(t => <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-muted border border-border flex items-center gap-1">{t}<button onClick={() => removeTag(t)} className="text-muted-foreground hover:text-foreground">×</button></span>)}
                      <input value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={e => e.key === "Enter" && addTag()} placeholder="+ tag" className="w-16 px-1.5 py-0.5 rounded-md border border-border bg-background text-[10px] outline-none focus:border-primary" />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <select value={d.status} onChange={e => post("bd_deal_update", { id: d.id, status: e.target.value }).then(() => loadList())} className="text-[10px] px-1.5 py-1 rounded-md border border-border bg-background outline-none">
                        {["lead", "qualifying", "proposal", "negotiating", "demo_requested", "closing", "hired", "in_delivery", "repeat", "stalled", "lost"].map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                      <button onClick={archiveDeal} className="text-[10px] px-2 py-1 rounded-md border border-border text-muted-foreground hover:border-primary">Archive</button>
                      {confirmDel ? (<span className="text-[10px] flex items-center gap-1"><button onClick={deleteDeal} className="px-2 py-1 rounded-md border" style={{ color: "#ef4444", borderColor: "#ef444455", background: "#ef444411" }}>Confirm</button><button onClick={() => setConfirmDel(false)} className="text-muted-foreground">cancel</button></span>) : (<button onClick={() => setConfirmDel(true)} className="text-[10px] px-2 py-1 rounded-md border text-muted-foreground ml-auto" style={{ borderColor: "#ef444455" }}>Delete</button>)}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* CENTER — chat + composer */}
        <div className="rounded-2xl border border-border bg-card flex flex-col min-h-0">
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border">
            <div className="w-8 h-8 rounded-full bg-primary/15 text-primary flex items-center justify-center text-sm font-bold">{(clientName || "?").slice(0, 1).toUpperCase()}</div>
            <div className="font-semibold text-sm truncate">{clientName}</div>
            {strategy?.deal_state?.stage && <Chip text={strategy.deal_state.stage} color={stageColor(strategy.deal_state.stage)} />}
            {selected?.id && <Chip text="✓ saved" color="#10b981" />}
            {(clientSite || conversation.trim()) && <button onClick={launchDemo} className="ml-auto text-[11px] px-2.5 py-1 rounded-md bg-primary/10 text-primary border border-primary/30">Build demo →</button>}
          </div>
          {error && <div className="mx-4 mt-2 rounded-lg border p-2 text-xs" style={{ color: "#ef4444", borderColor: "#ef444455", background: "#ef444411" }}>{error}</div>}
          {notice && !error && <div className="mx-4 mt-2 text-[11px] text-primary">{notice}</div>}

          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5 min-h-0">
            {messages.length === 0 && <p className="text-xs text-muted-foreground text-center py-10">Paste the Fiverr conversation below. The thread renders here; the intelligence appears on the right.</p>}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.sender === "seller" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap ${m.sender === "seller" ? "bg-primary/10 rounded-br-sm" : "bg-muted rounded-bl-sm"}`}>{m.text}</div>
              </div>
            ))}
          </div>

          {/* composer */}
          <div className="border-t border-border p-3 space-y-2">
            {(strategy?.draft_reply || replyDraft) && (
              <div className="rounded-xl border border-primary/40 bg-primary/5 p-2.5">
                <div className="flex items-center justify-between mb-1"><span className="text-[11px] font-semibold text-primary uppercase tracking-wider">Suggested reply — edit &amp; copy</span><button onClick={() => copy(replyDraft)} className="text-[11px] px-2 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/30">Copy</button></div>
                <textarea value={replyDraft} onChange={e => setReplyDraft(e.target.value)} className="w-full h-20 px-2 py-1.5 rounded-lg border border-border bg-background text-sm outline-none focus:border-primary resize-y" />
              </div>
            )}
            <textarea value={pasteInput} onChange={e => { setPasteInput(e.target.value); setNotice(""); }} placeholder="Paste new messages (or the whole chat). Duplicates are ignored." className="w-full h-16 px-3 py-2 rounded-xl border border-border bg-background text-sm outline-none focus:border-primary resize-y" />
            <div className="flex items-center gap-2 flex-wrap">
              <button onClick={() => addAndAnalyse(false)} disabled={busy === "strategize" || !pasteInput.trim()} className="text-xs px-4 py-1.5 rounded-lg bg-primary text-primary-foreground font-semibold disabled:opacity-50">{busy === "strategize" ? "Analysing…" : "Add & analyse"}</button>
              <label className="text-[11px] px-2.5 py-1 rounded-md bg-primary/10 text-primary border border-primary/30 cursor-pointer">{busy === "attach" ? "Adding…" : "📎 File"}<input type="file" accept=".txt,.md,.markdown,.csv,.tsv,.json,.html,.htm,.log,.xml,.yaml,.yml" className="hidden" onChange={e => attachFile(e.target.files?.[0])} disabled={busy === "attach"} /></label>
              <button onClick={() => setShowAttach(v => !v)} className="text-[11px] px-2.5 py-1 rounded-md bg-primary/10 text-primary border border-primary/30">🎙 Transcript</button>
              <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground ml-auto"><input type="checkbox" checked={autoAnalyse} onChange={e => setAutoAnalyse(e.target.checked)} />Auto</label>
            </div>
            {showAttach && (<div><textarea value={transcript} onChange={e => setTranscript(e.target.value)} placeholder="Paste the call transcript (Fiverr recordings expire ~30 days — save it now)…" className="w-full h-20 px-2 py-1.5 rounded-lg border border-border bg-background text-xs outline-none focus:border-primary resize-y" /><button onClick={() => { if (transcript.trim()) { attach("call transcript", "transcript", transcript); setTranscript(""); setShowAttach(false); } }} disabled={busy === "attach" || !transcript.trim()} className="mt-1 text-[11px] px-3 py-1 rounded-lg bg-primary text-primary-foreground disabled:opacity-50">Add transcript</button></div>)}
          </div>
        </div>

        {/* RIGHT — advanced intelligence */}
        <div className="rounded-2xl border border-border bg-card overflow-y-auto min-h-0">
          {!strategy && !selected?.id ? (
            <p className="text-xs text-muted-foreground p-4">The intelligence panel fills in once you paste a conversation — deal stage, what the client wants, the next move, an inline site audit you can run, a call script, reminders and risks, all derived from the chat. You never leave this page.</p>
          ) : (
            <div className="px-4 py-2">
              {/* always-visible summary */}
              {strategy && (
                <div className="pb-3 border-b border-border">
                  <div className="flex flex-wrap items-center gap-1.5 mb-1">
                    <Chip text={strategy.deal_state?.stage} color={stageColor(strategy.deal_state?.stage)} />
                    {strategy.deal_state?.temperature && <Chip text={strategy.deal_state.temperature} color={tempColor(strategy.deal_state.temperature)} />}
                  </div>
                  {strategy.deal_state?.summary && <p className="text-xs text-muted-foreground">{strategy.deal_state.summary}</p>}
                </div>
              )}

              {strategy?.next_move && <Acc k="next" title="Next best move"><div className="rounded-lg border border-primary/30 bg-primary/5 p-2 text-xs">{strategy.next_move}</div></Acc>}

              <Acc k="audit" title="Quick site audit" defaultBadge="demo · inline">
                <button onClick={runAudit} disabled={auditing || !clientSite} className="text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground font-semibold disabled:opacity-50 mb-2">{auditing ? "Auditing…" : clientSite ? `Audit ${clientSite}` : "No client site detected yet"}</button>
                {audit && (
                  <div className="text-xs text-muted-foreground space-y-1">
                    <p className="text-foreground">Crawled {audit.pages_reachable} page(s) of {audit.project_domain}.</p>
                    {audit.performance && <p>Performance {audit.performance.performance_score}/100 · LCP {audit.performance.lcp}{audit.performance.cls ? ` · CLS ${audit.performance.cls}` : ""}</p>}
                    {Object.entries(audit.issues || {}).sort((a: any, b: any) => b[1].count - a[1].count).slice(0, 8).map(([k, v]: any) => <div key={k}>• {v.count} {k.replace(/_/g, " ")}</div>)}
                    {Object.keys(audit.schema_coverage || {}).length > 0 && <p>Schema: {Object.keys(audit.schema_coverage).join(", ")}</p>}
                    <p className="text-[11px] text-muted-foreground/70">Saved to this deal and folded into the strategy. Run the full audit in the Wizard for the deep report.</p>
                  </div>
                )}
              </Acc>

              {intel && (intel.wants?.length || intel.pain_points?.length || intel.buying_signals?.length || intel.objections?.length || intel.budget_signals?.length) ? (
                <Acc k="client" title="Client intelligence">
                  {intel.wants?.length > 0 && <><div className="text-[11px] font-semibold text-muted-foreground mt-1">Wants</div><List items={intel.wants} /></>}
                  {intel.pain_points?.length > 0 && <><div className="text-[11px] font-semibold text-muted-foreground mt-1.5">Pain points</div><List items={intel.pain_points} /></>}
                  {intel.buying_signals?.length > 0 && <><div className="text-[11px] font-semibold text-muted-foreground mt-1.5">Buying signals</div><List items={intel.buying_signals} /></>}
                  {intel.objections?.length > 0 && <><div className="text-[11px] font-semibold text-muted-foreground mt-1.5">Objections</div><List items={intel.objections} /></>}
                  {intel.budget_signals?.length > 0 && <><div className="text-[11px] font-semibold text-muted-foreground mt-1.5">Budget signals</div><List items={intel.budget_signals} /></>}
                </Acc>
              ) : null}

              {strategy?.action_items?.length > 0 && <Acc k="actions" title="Do now" defaultBadge={strategy.action_items.length}><ul className="space-y-1">{strategy.action_items.map((a: any, i: number) => <li key={i} className="text-xs text-muted-foreground"><span className="text-foreground">{a.action}</span>{a.platform_can_help && <span className="ml-1"><Chip text="in-platform" color="#10b981" /></span>}</li>)}</ul></Acc>}

              {strategy?.reminders?.length > 0 && <Acc k="reminders" title="Reminders" defaultBadge={strategy.reminders.length}><ul className="space-y-1">{strategy.reminders.map((r: any, i: number) => <li key={i} className="text-xs text-muted-foreground">⏰ {r.text}{r.when ? <span className="text-foreground/70"> — {r.when}</span> : null}</li>)}</ul></Acc>}

              {strategy?.call_script?.needed && (
                <Acc k="call" title="Call script">
                  <div className="text-xs text-muted-foreground space-y-1">
                    {strategy.call_script.opening && <p><b className="text-foreground">Open:</b> {strategy.call_script.opening}</p>}
                    {strategy.call_script.discovery_questions?.length > 0 && <div><b className="text-foreground">Ask:</b><List items={strategy.call_script.discovery_questions} /></div>}
                    {strategy.call_script.objection_handling?.length > 0 && <div><b className="text-foreground">Objections:</b><List items={strategy.call_script.objection_handling} /></div>}
                    {strategy.call_script.close && <p><b className="text-foreground">Close:</b> {strategy.call_script.close}</p>}
                  </div>
                </Acc>
              )}

              {strategy?.risk_flags?.length > 0 && <Acc k="risks" title="Watch out" defaultBadge={strategy.risk_flags.length}><div className="rounded-lg border p-2" style={{ borderColor: "#f59e0b55", background: "#f59e0b11" }}><List items={strategy.risk_flags} /></div></Acc>}

              {strategy?.needs_attachments?.length > 0 && <Acc k="needs" title="Add what the chat references"><div className="rounded-lg border p-2 text-xs" style={{ borderColor: "#6366f155", background: "#6366f111" }}>{strategy.needs_attachments.map((a: any, i: number) => <div key={i} className="text-muted-foreground">📎 {a.what}{a.note ? ` — ${a.note}` : ""}</div>)}</div></Acc>}

              {selected?.id && (selected.attachments || []).length > 0 && (
                <Acc k="lead" title="Attachments">
                  <div className="flex flex-wrap gap-1">{selected.attachments.map((a: any, i: number) => <Chip key={i} text={`📎 ${a.name}`} color="#10b981" />)}</div>
                </Acc>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
