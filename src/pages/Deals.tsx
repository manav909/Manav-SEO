/* Build 12.44 — Deal Workspace as an advanced Fiverr-style 3-pane console.
   Left: conversations. Center: chat thread + composer (with the AI's
   suggested reply). Right: the Advanced Intelligence panel (deal state,
   client intel, next move, action items, call script, reminders, risks,
   attachments, demo, lead management). Paste only the chat — the rest is
   derived. Project-independent. */
import { useState, useEffect, useRef } from "react";
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
function Acc({ k, title, children, defaultBadge, open, toggle }: { k: string; title: string; children: any; defaultBadge?: any; open: Record<string, boolean>; toggle: (k: string) => void }) {
  return (
    <div className="border-b border-border/60">
      <button onClick={() => toggle(k)} className="w-full flex items-center justify-between py-2.5 text-left group">
        <span className="text-[10px] font-semibold uppercase tracking-[0.13em] text-muted-foreground group-hover:text-foreground transition-colors">{title}{defaultBadge != null && <span className="ml-1.5 text-primary/80 normal-case tracking-normal font-medium">{defaultBadge}</span>}</span>
        <span className={`text-muted-foreground text-[10px] transition-transform ${open[k] ? "rotate-90" : ""}`}>▸</span>
      </button>
      {open[k] && <div className="pb-3">{children}</div>}
    </div>
  );
}

type Win = { id: string; type: string; title: string; status: "running" | "done" | "error"; result?: any; error?: string; dealId?: string; dealName?: string };
const money2 = (n: any) => "$" + Number(n || 0).toLocaleString();
const WIN_ICON: Record<string, string> = { audit: "🔍", aeo: "🤖", competitor: "📊", offer: "💰", roadmap: "🗺️", casestudy: "🏆", ask: "✨" };

function winExportText(w: Win): string {
  const r = w.result || {};
  if (w.type === "audit") { const issues = Object.entries(r.issues || {}).map(([k, v]: any) => `- ${v.count} ${k.replace(/_/g, " ")}`).join("\n"); return `SITE AUDIT — ${r.project_domain}\nPages crawled: ${r.pages_reachable}\n${r.performance ? `Performance: ${r.performance.performance_score}/100, LCP ${r.performance.lcp}\n` : ""}Schema: ${Object.keys(r.schema_coverage || {}).join(", ") || "none"}\n\nIssues:\n${issues}`; }
  if (w.type === "aeo") return `AEO / GEO READINESS — ${r.site}\n${(r.signals || []).map((s: any) => `${s.ok ? "[OK]" : "[ ]"} ${s.label}`).join("\n")}\nSchema: ${(r.schema_types || []).join(", ") || "none"}\n${r.robots_ai}\n\nFixes:\n${(r.recommendations || []).map((x: string) => `- ${x}`).join("\n")}`;
  if (w.type === "competitor") { const gaps = (r.keyword_gap?.biggest_gaps || []).map((g: any) => `- "${g.query}": ${g.competitor} #${g.competitor_position}${g.client_position ? ` vs you #${g.client_position}` : " (you absent)"}`).join("\n"); return `COMPETITOR SNAPSHOT\n${r.summary || ""}\n\nWhere they beat you:\n${gaps}`; }
  if (w.type === "offer") return `${r.recommended_package} — ${r.price_band} — ${r.delivery_time}\n\nIncludes:\n${(r.scope || []).map((x: string) => `- ${x}`).join("\n")}\n\nDeliverables:\n${(r.deliverables || []).map((x: string) => `- ${x}`).join("\n")}\n${(r.addons || []).length ? `\nAdd-ons:\n${r.addons.map((a: any) => `- ${a.name}: ${a.price}`).join("\n")}\n` : ""}\n${r.offer_text || ""}`;
  if (w.type === "roadmap") return `30/60/90 ROADMAP\n${r.summary || ""}\n\nFirst 30 days:\n${(r.phase_30 || []).map((x: string) => `- ${x}`).join("\n")}\n\nDays 31-60:\n${(r.phase_60 || []).map((x: string) => `- ${x}`).join("\n")}\n\nDays 61-90:\n${(r.phase_90 || []).map((x: string) => `- ${x}`).join("\n")}`;
  if (w.type === "casestudy") { if (r.generated) return `${r.title || "Case study (draft)"}\n\nSituation:\n${r.situation || ""}\n\nApproach:\n${(r.approach || []).map((x: string) => `- ${x}`).join("\n")}\n\nResults (fill in your real numbers):\n${(r.results_template || []).map((x: string) => `- ${x}`).join("\n")}\n\nClient message:\n${r.client_snippet || ""}\n\n${r.note || ""}`; return `${r.matched?.title || ""}${r.matched?.industry ? ` (${r.matched.industry})` : ""}\n${r.why || ""}\n\n${r.client_snippet || ""}`; }
  if (w.type === "ask") return `${r.answer || ""}${r.client_reply ? `\n\nReply:\n${r.client_reply}` : ""}`;
  return JSON.stringify(r, null, 2);
}

function WinBody({ w, onUseReply }: { w: Win; onUseReply: (t: string) => void }) {
  const r = w.result || {};
  const lbl = "text-[10px] font-semibold uppercase tracking-[0.13em] text-muted-foreground";
  const snippet = (heading: string, text: string) => (
    <div className="rounded-xl border border-primary/25 bg-primary/[0.06] p-2.5 mt-1">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-semibold text-primary uppercase tracking-[0.13em]">{heading}</span>
        <button onClick={() => onUseReply(text)} className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-primary/10 text-primary ring-1 ring-primary/20 hover:bg-primary/15 transition-colors">Use &amp; copy</button>
      </div>
      <p className="whitespace-pre-wrap break-words text-foreground text-[12.5px] leading-relaxed">{text}</p>
    </div>
  );
  if (w.type === "audit") return (
    <div className="space-y-3.5 text-[13px]">
      <div className="flex items-baseline gap-2 flex-wrap"><span className="font-mono text-foreground font-medium">{r.project_domain}</span><span className="text-muted-foreground text-xs tabular-nums">{r.pages_reachable} pages crawled</span></div>
      {r.performance && <div className="flex items-center gap-3 text-xs text-muted-foreground"><span>Performance <span className="font-mono tabular-nums text-foreground font-semibold">{r.performance.performance_score}</span>/100</span><span>LCP <span className="font-mono tabular-nums text-foreground">{r.performance.lcp}</span></span></div>}
      <div>
        <div className={lbl + " mb-2"}>Issues found</div>
        <div className="space-y-1.5">{Object.entries(r.issues || {}).sort((a: any, b: any) => b[1].count - a[1].count).slice(0, 14).map(([k, v]: any) => <div key={k} className="flex items-center gap-2.5 text-muted-foreground"><span className="font-mono tabular-nums text-foreground/80 w-7 text-right shrink-0">{v.count}</span><span>{k.replace(/_/g, " ")}</span></div>)}</div>
      </div>
      {Object.keys(r.schema_coverage || {}).length > 0 && <div><div className={lbl + " mb-2"}>Schema present</div><div className="flex flex-wrap gap-1">{Object.keys(r.schema_coverage).map((s: string) => <span key={s} className="font-mono text-[11px] px-2 py-0.5 rounded-md bg-muted text-muted-foreground">{s}</span>)}</div></div>}
    </div>
  );
  if (w.type === "aeo") return (
    <div className="space-y-3 text-[13px]">
      <div className="space-y-1.5">{(r.signals || []).map((s: any, i: number) => <div key={i} className="flex items-center gap-2"><span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] shrink-0 ${s.ok ? "bg-emerald-500/15 text-emerald-600" : "bg-rose-500/15 text-rose-600"}`}>{s.ok ? "✓" : "✕"}</span><span className="text-foreground">{s.label}</span></div>)}</div>
      {r.schema_types?.length > 0 && <div className="flex flex-wrap gap-1">{r.schema_types.map((s: string) => <span key={s} className="font-mono text-[11px] px-2 py-0.5 rounded-md bg-muted text-muted-foreground">{s}</span>)}</div>}
      {r.robots_ai && <p className="text-muted-foreground text-xs">{r.robots_ai}</p>}
      {r.recommendations?.length > 0 && <div><div className={lbl + " mb-2"}>Fixes to pitch</div><List items={r.recommendations} /></div>}
    </div>
  );
  if (w.type === "competitor") return (
    <div className="space-y-3.5 text-[13px]">
      {r.summary && <p className="text-muted-foreground leading-relaxed">{r.summary}</p>}
      {r.keyword_gap?.biggest_gaps?.length > 0 && <div><div className={lbl + " mb-2"}>Where they beat you</div><div className="space-y-1.5">{r.keyword_gap.biggest_gaps.slice(0, 8).map((g: any, i: number) => <div key={i} className="text-muted-foreground"><span className="font-mono text-foreground/90">"{g.query}"</span> — {g.competitor} <span className="tabular-nums">#{g.competitor_position}</span>{g.client_position ? <span> vs you <span className="tabular-nums">#{g.client_position}</span></span> : <span className="text-rose-500"> (you absent)</span>}</div>)}</div></div>}
      {r.content_gaps?.length > 0 && <div><div className={lbl + " mb-2"}>Content gaps</div><List items={r.content_gaps.slice(0, 8).map((c: any) => c.topic || c.query || "")} /></div>}
    </div>
  );
  if (w.type === "offer") return (
    <div className="space-y-3 text-[13px]">
      <div className="flex items-center gap-2 flex-wrap"><span className="text-foreground font-semibold tracking-tight">{r.recommended_package}</span><span className="font-mono text-primary text-xs px-2 py-0.5 rounded-md bg-primary/10 ring-1 ring-primary/20">{r.price_band}</span><span className="text-muted-foreground text-xs">{r.delivery_time}</span></div>
      {r.scope?.length > 0 && <div><div className={lbl + " mb-2"}>Includes</div><List items={r.scope} /></div>}
      {r.deliverables?.length > 0 && <div><div className={lbl + " mb-2"}>Deliverables</div><List items={r.deliverables} /></div>}
      {r.addons?.length > 0 && <div><div className={lbl + " mb-2"}>Add-ons</div><div className="space-y-1">{r.addons.map((a: any, i: number) => <div key={i} className="flex items-center justify-between text-muted-foreground"><span>{a.name}</span><span className="font-mono text-foreground/90">{a.price}</span></div>)}</div></div>}
      {r.rationale && <p className="text-muted-foreground text-xs leading-relaxed">{r.rationale}</p>}
      {r.offer_text && snippet("Offer message", r.offer_text)}
    </div>
  );
  if (w.type === "roadmap") return (
    <div className="space-y-3 text-[13px]">
      {r.summary && <p className="text-muted-foreground leading-relaxed">{r.summary}</p>}
      {[["First 30 days", r.phase_30], ["Days 31–60", r.phase_60], ["Days 61–90", r.phase_90]].map(([t, arr]: any, i: number) => (arr?.length > 0 ? <div key={i}><div className={lbl + " mb-2"}>{t}</div><List items={arr} /></div> : null))}
    </div>
  );
  if (w.type === "casestudy") return (
    <div className="space-y-2.5 text-[13px]">
      {r.generated ? (<>
        <div className="flex items-center gap-2"><span className="text-foreground font-semibold tracking-tight">{r.title}</span><span className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-600 shrink-0">Draft</span></div>
        {r.situation && <p className="text-muted-foreground leading-relaxed">{r.situation}</p>}
        {r.approach?.length > 0 && <div><div className={lbl + " mb-2"}>Approach</div><List items={r.approach} /></div>}
        {r.results_template?.length > 0 && <div><div className={lbl + " mb-2"}>Results — fill in your real numbers</div><List items={r.results_template} /></div>}
        {r.client_snippet && snippet("Adapt & share", r.client_snippet)}
        {r.note && <p className="text-[11px] text-amber-600/90 leading-relaxed">⚠ {r.note}</p>}
      </>) : (<>
        {r.matched?.title && <div className="text-foreground font-semibold tracking-tight">{r.matched.title}{r.matched.industry ? <span className="text-muted-foreground font-normal"> · {r.matched.industry}</span> : ""}</div>}
        {r.why && <p className="text-muted-foreground leading-relaxed">{r.why}</p>}
        {r.client_snippet && snippet("Share with client", r.client_snippet)}
      </>)}
    </div>
  );
  if (w.type === "ask") return (
    <div className="space-y-3 text-[13px]">
      <p className="whitespace-pre-wrap break-words text-foreground leading-relaxed">{r.answer}</p>
      {r.client_reply && snippet("Reply you can send", r.client_reply)}
      {r.suggested_tools?.length > 0 && <div className="flex flex-wrap gap-1">{r.suggested_tools.map((t: string, i: number) => <span key={i} className="text-[10px] px-2 py-0.5 rounded-md bg-muted ring-1 ring-border/60 text-muted-foreground">{t}</span>)}</div>}
    </div>
  );
  return <pre className="text-[10px] text-muted-foreground whitespace-pre-wrap break-words">{JSON.stringify(r, null, 2)}</pre>;
}

function WinManager({ win, onMin, onClose, onDownload, onUseReply }: { win: Win; onMin: () => void; onClose: () => void; onDownload: () => void; onUseReply: (t: string) => void }) {
  const running = win.status === "running";
  return (
    <div className="fixed z-50 right-5 top-20 w-[480px] max-w-[93vw] max-h-[76vh] rounded-2xl border border-border/70 bg-card/95 backdrop-blur-2xl shadow-[0_30px_70px_-20px_rgba(15,23,42,0.45)] ring-1 ring-black/[0.04] flex flex-col overflow-hidden">
      <div className="flex items-center gap-2.5 px-3.5 py-2.5 border-b border-border/60 bg-gradient-to-b from-muted/30 to-transparent">
        <span className="w-7 h-7 rounded-lg bg-primary/10 text-primary ring-1 ring-primary/15 flex items-center justify-center text-[15px] shrink-0">{WIN_ICON[win.type] || "•"}</span>
        <div className="min-w-0 flex-1">
          {win.dealName && <div className="text-[9px] font-semibold uppercase tracking-[0.13em] text-primary/70 truncate leading-tight">{win.dealName}</div>}
          <div className="text-[13px] font-semibold tracking-tight text-foreground truncate leading-tight">{win.title}</div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className={`w-1.5 h-1.5 rounded-full ${running ? "bg-amber-500 animate-pulse" : win.status === "error" ? "bg-rose-500" : "bg-emerald-500"}`} />
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{running ? "Working" : win.status === "error" ? "Couldn't finish" : "Ready"}</span>
          </div>
        </div>
        {win.status === "done" && <button onClick={onDownload} className="text-[11px] font-medium px-2.5 py-1 rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20 hover:bg-primary/15 transition-colors shrink-0">Export</button>}
        <button onClick={onMin} title="Minimize" className="w-7 h-7 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors flex items-center justify-center text-lg leading-none shrink-0">–</button>
        <button onClick={onClose} title="Close" className="w-7 h-7 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors flex items-center justify-center text-sm shrink-0">✕</button>
      </div>
      <div className="overflow-y-auto px-4 py-4">
        {running ? <div className="flex items-center gap-2.5 text-muted-foreground text-[13px] py-2"><span className="w-4 h-4 rounded-full border-2 border-primary/25 border-t-primary animate-spin shrink-0" /> Working through it — live crawls and SERP take a few seconds.</div>
          : win.status === "error" ? <div className="text-[13px] text-rose-500 py-1">{win.error}</div>
            : <WinBody w={win} onUseReply={onUseReply} />}
      </div>
    </div>
  );
}

function WinTaskbar({ windows, onRestore, onClose, onClearDone }: { windows: Win[]; onRestore: (w: Win) => void; onClose: (id: string) => void; onClearDone: () => void }) {
  if (!windows.length) return null;
  const sorted = [...windows].sort((a, b) => (a.dealName || "").localeCompare(b.dealName || ""));
  const anyDone = windows.some(w => w.status !== "running");
  return (
    <div className="fixed z-40 bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-2 py-1.5 rounded-2xl border border-border/60 bg-card/80 backdrop-blur-2xl shadow-[0_18px_50px_-15px_rgba(15,23,42,0.5)] ring-1 ring-black/[0.04] max-w-[94vw] overflow-x-auto">
      <span className="text-[9px] font-semibold uppercase tracking-[0.13em] text-muted-foreground px-1.5 shrink-0">Jobs</span>
      {sorted.map(w => {
        const running = w.status === "running";
        return (
          <div key={w.id} className="group flex items-center gap-2 pl-2.5 pr-1.5 py-1 rounded-xl border border-border/50 bg-background/40 hover:bg-muted/60 hover:border-border transition-all whitespace-nowrap shrink-0">
            <span className={`w-2 h-2 rounded-full ring-2 ring-background shrink-0 ${running ? "bg-amber-500 animate-pulse" : w.status === "error" ? "bg-rose-500" : "bg-emerald-500"}`} />
            <button onClick={() => onRestore(w)} className="flex items-center gap-1.5 max-w-[180px]">
              <span className="text-xs shrink-0">{WIN_ICON[w.type] || ""}</span>
              <span className="flex flex-col items-start leading-tight min-w-0">
                {w.dealName && <span className="text-[8.5px] font-semibold uppercase tracking-wider text-muted-foreground truncate max-w-[120px]">{w.dealName}</span>}
                <span className="text-[11px] font-medium tracking-tight text-foreground/90 truncate max-w-[120px]">{w.title.replace(/ · .*/, "")}</span>
              </span>
            </button>
            <button onClick={() => onClose(w.id)} className="w-4 h-4 rounded text-muted-foreground/60 hover:text-foreground hover:bg-muted flex items-center justify-center text-xs leading-none opacity-0 group-hover:opacity-100 transition-opacity shrink-0">×</button>
          </div>
        );
      })}
      {anyDone && <button onClick={onClearDone} className="text-[10px] font-medium text-muted-foreground hover:text-foreground px-2 shrink-0">Clear done</button>}
    </div>
  );
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
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [confirmDel, setConfirmDel] = useState(false);
  const [outcomeMode, setOutcomeMode] = useState("");
  const [outcomeValue, setOutcomeValue] = useState("");
  const [outcomeReason, setOutcomeReason] = useState("");
  const [transcript, setTranscript] = useState("");
  const [showAttach, setShowAttach] = useState(false);
  const [replyDraft, setReplyDraft] = useState("");
  const [audit, setAudit] = useState<any>(null);
  const [auditing, setAuditing] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({ facts: true, next: true, client: true, actions: true });
  const [nameInput, setNameInput] = useState("");
  const [askInput, setAskInput] = useState("");
  const [asking, setAsking] = useState(false);
  const [askResult, setAskResult] = useState<any>(null);
  const [offer, setOffer] = useState<any>(null);
  const [roadmap, setRoadmap] = useState<any>(null);
  const [variants, setVariants] = useState<any[]>([]);
  const [toolBusy, setToolBusy] = useState("");
  const [aeo, setAeo] = useState<any>(null);
  const [comp, setComp] = useState<any>(null);
  const [compCo, setCompCo] = useState("");
  const [compKw, setCompKw] = useState("");
  const [siteInput, setSiteInput] = useState("");
  const [doneActions, setDoneActions] = useState<string[]>([]);
  const [caseMatch, setCaseMatch] = useState<any>(null);
  const [caseLib, setCaseLib] = useState<any[]>([]);
  const [showCsLib, setShowCsLib] = useState(false);
  const [csForm, setCsForm] = useState({ title: "", summary: "", results: "", industry: "", tags: "" });
  const [windows, setWindows] = useState<Win[]>([]);
  const [focusedWin, setFocusedWin] = useState("");
  const [autoFired, setAutoFired] = useState<string[]>([]);
  const [analyzingIds, setAnalyzingIds] = useState<string[]>([]);
  const selectedIdRef = useRef<string>("");
  useEffect(() => { selectedIdRef.current = selected?.id || ""; }, [selected]);
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
    setSelected(d); selectedIdRef.current = d.id; setConversation(d.conversation || ""); applyStrategy(d.strategy || null); setPasteInput(""); setLastAnalysed(d.conversation || "");
    setTags(Array.isArray(d.tags) ? d.tags : []); setConfirmDel(false); setAudit(null); setNameInput(d.client_name || ""); setOffer(null); setRoadmap(null); setVariants([]); setAskResult(null); setAeo(null); setComp(null); setCompCo(""); setCompKw(""); setSiteInput(""); setDoneActions([]); };
  const newDeal = () => { setSelected(null); selectedIdRef.current = ""; setConversation(""); setPasteInput(""); applyStrategy(null); setError(""); setNotice(""); setLastAnalysed(""); setTags([]); setConfirmDel(false); setAudit(null); setNameInput(""); setOffer(null); setRoadmap(null); setVariants([]); setAskResult(null); setAeo(null); setComp(null); setCompCo(""); setCompKw(""); setSiteInput(""); setDoneActions([]); setFocusedWin(""); };

  const genVariants = async () => { setToolBusy("variants"); setError(""); const r: any = await post("bd_reply_variants", { id: selected?.id, conversation }); setToolBusy(""); if (!r?.success) { setError(r?.error || "Could not get reply options."); return; } setVariants(r.variants || []); };
  const loadCaseLib = async () => { const r: any = await post("bd_casestudy_list", {}); if (r?.success) setCaseLib(r.case_studies || []); };
  const saveCaseStudy = async () => { if (!csForm.title.trim() && !csForm.summary.trim()) { setError("Add a title or summary for the case study."); return; } const r: any = await post("bd_casestudy_save", { title: csForm.title, summary: csForm.summary, results: csForm.results, industry: csForm.industry, tags: csForm.tags.split(",").map(s => s.trim()).filter(Boolean) }); if (!r?.success) { setError(r?.error || "Could not save."); return; } setCsForm({ title: "", summary: "", results: "", industry: "", tags: "" }); loadCaseLib(); };
  const deleteCaseStudy = async (id: string) => { await post("bd_casestudy_delete", { id }); loadCaseLib(); };
  useEffect(() => { if (showCsLib) loadCaseLib(); /* eslint-disable-next-line */ }, [showCsLib]);

  const renameDeal = async (name: string) => {
    const n = name.trim(); if (!selected?.id || !n) return;
    const r: any = await post("bd_deal_update", { id: selected.id, client_name: n });
    if (r?.deal) setSelected(r.deal); loadList();
  };

  /* Autonomy: when a chat is analysed, auto-fill competitor inputs and auto-fire the
     free diagnostics (audit + AEO) + case match — once per deal (autoFired guard),
     skipping anything already cached on the deal. */
  useEffect(() => {
    if (!strategy) return;
    const f = strategy.deal_facts || {};
    if (!compCo && (f.competitors || []).length) setCompCo((f.competitors || []).join(", "));
    if (!compKw && (f.target_keywords || []).length) setCompKw((f.target_keywords || []).join(", "));
    const site = strategy.client_site || (f.urls || [])[0] || "";
    if (site && !siteInput) setSiteInput(site);
    if (!site) return;
    const dealKey = selected?.id || "new";
    const cached = new Set((selected?.attachments || []).map((a: any) => a.kind));
    if (!autoFired.includes(`${dealKey}:audit`) && !cached.has("audit")) { setAutoFired(a => [...a, `${dealKey}:audit`]); runAudit(true); }
    if (!autoFired.includes(`${dealKey}:aeo`) && !cached.has("aeo")) { setAutoFired(a => [...a, `${dealKey}:aeo`]); runAeo(true); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strategy]);

  const runStrategize = async (convo: string, auto = false) => {
    if (!convo.trim()) return;
    const startId = selected?.id || "";
    if (startId && analyzingIds.includes(startId)) return;
    setError(""); if (selectedIdRef.current === startId && !auto) setNotice("");
    let id = selected?.id;
    try {
      const nm = selected?.client_name && selected.client_name !== "Untitled lead" ? selected.client_name : (detectClientName(convo) || "Untitled lead");
      const save: any = await post("bd_deal_save", { id, client_name: nm, conversation: convo });
      if (save?.success && save.deal) { id = save.deal.id; if (selectedIdRef.current === startId) { setSelected(save.deal); selectedIdRef.current = save.deal.id; setNameInput(save.deal.client_name || nm); } }
      if (id) setAnalyzingIds(a => a.includes(id as string) ? a : [...a, id as string]);
      const r: any = await post("bd_strategize", { id, conversation: convo });
      if (selectedIdRef.current === id) setLastAnalysed(convo);
      if (!r?.success || !r?.strategy) { if (selectedIdRef.current === id) setError(r?.error || "Could not analyse this time — tap Analyse to retry."); return; }
      if (selectedIdRef.current === id) { applyStrategy(r.strategy); setNotice(""); }
      loadList();
    } catch (e: any) { if (selectedIdRef.current === id) setError(e?.message || "Analysis failed — tap Analyse to retry."); }
    finally { if (id) setAnalyzingIds(a => a.filter(x => x !== id)); }
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
    if (!autoAnalyse || !pasteInput.trim() || (selected?.id && analyzingIds.includes(selected.id))) return;
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
  const submitOutcome = async () => {
    if (!selected?.id || !outcomeMode) return;
    setBusy("outcome");
    const r: any = await post("bd_deal_outcome", { id: selected.id, outcome: outcomeMode, deal_value: parseFloat(outcomeValue) || 0, reason: outcomeReason });
    setBusy("");
    if (!r?.success) { setError(r?.error || "Could not record the outcome."); return; }
    setNotice(`Marked ${outcomeMode}. Learning captured for the HoD console.`); setOutcomeMode(""); setOutcomeValue(""); setOutcomeReason(""); loadList();
  };
  const copy = (t: string) => { try { navigator.clipboard.writeText(t); } catch { /* ignore */ } };

  /* ── Desktop windowing: tools run as app windows (or minimised loader pills). ── */
  const newWin = (type: string, title: string, focus: boolean) => { const id = type + "-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6); const dId = selected?.id || ""; setWindows(w => [...w.filter(x => !(x.type === type && (x.dealId || "") === dId && x.status === "running")), { id, type, title, status: "running" as const, dealId: dId, dealName: clientName }]); if (focus) setFocusedWin(id); return id; };
  const patchWin = (id: string, patch: Partial<Win>) => setWindows(w => w.map(x => x.id === id ? { ...x, ...patch } : x));
  const closeWin = (id: string) => { setWindows(w => w.filter(x => x.id !== id)); setFocusedWin(f => f === id ? "" : f); };
  const clearDoneWins = () => { setWindows(w => w.filter(x => x.status === "running")); setFocusedWin(f => { const still = windows.find(x => x.id === f); return still && still.status === "running" ? f : ""; }); };
  const restoreWin = (w: Win) => { if (w.dealId && w.dealId !== (selected?.id || "")) { openDeal(w.dealId).then(() => setFocusedWin(w.id)); } else setFocusedWin(w.id); };
  const useReply = (t: string) => { setReplyDraft(t); copy(t); };
  const downloadWin = (w: Win) => { try { const blob = new Blob([winExportText(w)], { type: "text/plain" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `${w.type}-${(w.dealName || clientName || "lead").replace(/\W+/g, "_")}.txt`; a.click(); URL.revokeObjectURL(url); } catch { /* ignore */ } };

  const runAudit = async (auto = false) => {
    if (!clientSite) { if (auto) return; const id = newWin("audit", "Site audit", true); patchWin(id, { status: "error", error: "No client website yet — enter the client's site in the 'Client site' box at the top of the right panel, then run the audit." }); return; }
    const id = newWin("audit", `Site audit · ${clientSite}`, !auto);
    const r: any = await post("bd_run_audit", { siteUrl: clientSite, id: selected?.id, projectId: selected?.id });
    if (!r?.report) { patchWin(id, { status: "error", error: r?.error || "Could not run the audit." }); return; }
    patchWin(id, { status: "done", result: r.report });
    if (selected?.id) { try { const g: any = await post("bd_deal_get", { id: selected.id }); if (g?.deal) setSelected(g.deal); } catch { /* ignore */ } }
  };
  const runAeo = async (auto = false) => {
    if (!clientSite) { if (auto) return; const id = newWin("aeo", "AEO readiness", true); patchWin(id, { status: "error", error: "No client website yet — enter the client's site in the 'Client site' box at the top of the right panel, then run the check." }); return; }
    const id = newWin("aeo", `AEO readiness · ${clientSite}`, !auto);
    const r: any = await post("bd_aeo_check", { id: selected?.id, siteUrl: clientSite });
    if (!r?.success) { patchWin(id, { status: "error", error: r?.error || "AEO check failed." }); return; }
    patchWin(id, { status: "done", result: r.report });
  };
  const runCompetitor = async () => {
    const competitors = (compCo.trim() ? compCo : (df.competitors || []).join(", ")).split(",").map((s: string) => s.trim()).filter(Boolean);
    const keywords = (compKw.trim() ? compKw : (df.target_keywords || []).join(", ")).split(",").map((s: string) => s.trim()).filter(Boolean);
    const id = newWin("competitor", "Competitor snapshot", true);
    const r: any = await post("bd_competitor_snapshot", { id: selected?.id, siteUrl: clientSite, competitors, keywords });
    if (!r?.success) { patchWin(id, { status: "error", error: r?.error || "Competitor snapshot failed." }); return; }
    patchWin(id, { status: "done", result: r.report });
  };
  const genOffer = async () => { const id = newWin("offer", "Offer & pricing", true); const r: any = await post("bd_build_offer", { id: selected?.id, conversation }); if (!r?.success) { patchWin(id, { status: "error", error: r?.error || "Could not build the offer." }); return; } patchWin(id, { status: "done", result: r.offer }); };
  const genRoadmap = async () => { const id = newWin("roadmap", "30/60/90 roadmap", true); const r: any = await post("bd_build_roadmap", { id: selected?.id, conversation }); if (!r?.success) { patchWin(id, { status: "error", error: r?.error || "Could not build the roadmap." }); return; } patchWin(id, { status: "done", result: r.roadmap }); };
  const matchCase = async (auto = false) => {
    const id = newWin("casestudy", "Case study", !auto);
    const r: any = await post("bd_casestudy_match", { id: selected?.id, conversation });
    if (r?.success) { patchWin(id, { status: "done", result: r }); return; }
    const g: any = await post("bd_casestudy_generate", { id: selected?.id, conversation });
    if (!g?.success) { patchWin(id, { status: "error", error: g?.error || r?.error || "Could not produce a case study." }); return; }
    patchWin(id, { status: "done", result: { generated: true, ...g.draft } });
  };
  const askQuestion = async (q: string) => {
    if (!q.trim()) return;
    const id = newWin("ask", q.length > 40 ? q.slice(0, 40) + "…" : q, true);
    const r: any = await post("bd_ask", { id: selected?.id, conversation, question: q });
    if (!r?.success) { patchWin(id, { status: "error", error: r?.error || "Could not answer." }); return; }
    patchWin(id, { status: "done", result: { answer: r.answer, client_reply: r.client_reply, suggested_tools: r.suggested_tools } });
  };
  const ask = () => { const q = askInput; setAskInput(""); askQuestion(q); };
  const actionForText = (text: string): { label: string; run: () => void } => {
    const t = (text || "").toLowerCase();
    if (/audit|crawl|site health|technical|broken link|core web|page speed|indexing/.test(t)) return { label: "Run audit", run: () => runAudit() };
    if (/aeo|geo|schema|llms\.txt|answer engine|ai overview|ai search|structured data|featured snippet/.test(t)) return { label: "Check AEO", run: () => runAeo() };
    if (/offer|pricing|price|package|quote|proposal/.test(t)) return { label: "Build offer", run: () => genOffer() };
    if (/roadmap|30\/60\/90|plan|timeline|milestone|strategy doc/.test(t)) return { label: "Build roadmap", run: () => genRoadmap() };
    if (/case stud|portfolio|proof|testimonial|past work|example of/.test(t)) return { label: "Case study", run: () => matchCase() };
    if (/competitor|serp|gap analysis|benchmark|rank.*compar/.test(t)) return { label: "Competitor", run: () => runCompetitor() };
    if (/repl|respond|message|answer|follow.?up|reach out|send them|outreach|pitch/.test(t)) return { label: "Draft reply", run: () => genVariants() };
    return { label: "Draft this", run: () => askQuestion(`How should I handle this, and draft anything I can send to the client: ${text}`) };
  };

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

  const clientName = strategy?.detected_client || selected?.client_name || "New lead";
  const clientSite = (siteInput.trim() || strategy?.client_site || (strategy?.deal_facts?.urls || [])[0] || "").trim();
  const messages = parseThread(conversation);
  const intel = strategy?.client_intel || {};
  const df = strategy?.deal_facts || {};
  const hasFacts = !!(df.budget || df.timeline || df.location || df.platform || df.service || df.deliverables?.length || df.urls?.length || df.competitors?.length || df.prices_discussed?.length || df.files_shared?.length || df.key_dates?.length || df.other_facts?.length);
  const focusedWindow = windows.find(w => w.id === focusedWin);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <PortalNav />
      <div className="max-w-[1700px] mx-auto px-3 py-4 grid grid-cols-1 lg:grid-cols-[270px_1fr_350px] gap-4 h-[calc(100vh-90px)]">

        {/* LEFT — conversations */}
        <div className="rounded-2xl border border-border/70 bg-card shadow-sm p-3 flex flex-col min-h-0 min-w-0">
          <div className="flex items-center justify-between mb-2.5">
            <h2 className="text-[13px] font-semibold tracking-tight">Conversations</h2>
            <button onClick={newDeal} className="text-[11px] px-2.5 py-1 rounded-lg bg-primary text-primary-foreground font-medium shadow-sm hover:shadow transition-shadow">+ New</button>
          </div>
          <input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === "Enter" && loadList()} placeholder="Search…" className="w-full px-3 py-1.5 rounded-lg border border-border bg-background text-xs outline-none focus:border-primary mb-2" />
          <div className="flex gap-1 mb-2 flex-wrap">
            {["active", "won", "archived", "all"].map(f => (<button key={f} onClick={() => setFilter(f)} className={`text-[11px] px-2 py-0.5 rounded-md border ${filter === f ? "bg-primary/15 text-primary border-primary/40" : "border-border text-muted-foreground"}`}>{f === "won" ? "Hired" : f[0].toUpperCase() + f.slice(1)}</button>))}
          </div>
          <div className="space-y-1 overflow-y-auto flex-1 min-h-0">
            {deals.length === 0 && <p className="text-xs text-muted-foreground py-4 text-center">No deals yet. + New, then paste a chat.</p>}
            {deals.map(d => (
              <div key={d.id}>
                <button onClick={() => { setFocusedWin(""); openDeal(d.id); }} className={`w-full text-left px-2.5 py-2 rounded-lg border flex gap-2 ${selected?.id === d.id ? "border-primary bg-primary/5 rounded-b-none" : "border-border hover:border-primary/40"}`}>
                  <div className="relative shrink-0">
                    <div className="w-8 h-8 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-xs font-bold">{(d.client_name || "?").slice(0, 1).toUpperCase()}</div>
                    {(analyzingIds.includes(d.id) || windows.some(w => (w.dealId || "") === d.id && w.status === "running")) && <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-amber-500 ring-2 ring-card animate-pulse" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1"><span className="text-xs font-semibold truncate">{d.client_name || "Untitled"}</span><span className="text-[10px] shrink-0" style={{ color: stageColor(d.status) }}>{d.status}</span></div>
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      {analyzingIds.includes(d.id) && <span className="inline-flex items-center gap-1 text-[9px] text-amber-600"><span className="w-2 h-2 rounded-full border border-amber-500 border-t-transparent animate-spin" />analysing</span>}
                      {windows.filter(w => (w.dealId || "") === d.id && w.status === "running").length > 0 && <span className="text-[9px] text-amber-600 tabular-nums">{windows.filter(w => (w.dealId || "") === d.id && w.status === "running").length} running</span>}
                      {windows.filter(w => (w.dealId || "") === d.id && w.status !== "running").length > 0 && <span className="text-[9px] text-emerald-600 tabular-nums">{windows.filter(w => (w.dealId || "") === d.id && w.status !== "running").length} ready</span>}
                      {Array.isArray(d.tags) && d.tags.slice(0, 2).map((t: string) => <span key={t} className="text-[9px] px-1 py-0.5 rounded bg-muted text-muted-foreground">{t}</span>)}
                    </div>
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
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => { setOutcomeMode("won"); setOutcomeValue(""); setOutcomeReason(""); }} className="text-[10px] px-2 py-1 rounded-md border" style={{ color: "#10b981", borderColor: "#10b98155", background: "#10b98111" }}>Mark won</button>
                      <button onClick={() => { setOutcomeMode("lost"); setOutcomeValue(""); setOutcomeReason(""); }} className="text-[10px] px-2 py-1 rounded-md border text-muted-foreground" style={{ borderColor: "#ef444455" }}>Mark lost</button>
                    </div>
                    {outcomeMode && (
                      <div className="space-y-1 rounded-md border border-border p-2">
                        <div className="text-[10px] font-semibold" style={{ color: outcomeMode === "won" ? "#10b981" : "#ef4444" }}>{outcomeMode === "won" ? "Record a win" : "Record a loss"}</div>
                        {outcomeMode === "won" && <input value={outcomeValue} onChange={e => setOutcomeValue(e.target.value)} placeholder="Deal value (USD)" className="w-full px-2 py-1 rounded-md border border-border bg-background text-[11px] outline-none focus:border-primary" />}
                        <textarea value={outcomeReason} onChange={e => setOutcomeReason(e.target.value)} placeholder={outcomeMode === "won" ? "What won it? (optional)" : "Why lost? (optional)"} className="w-full h-12 px-2 py-1 rounded-md border border-border bg-background text-[11px] outline-none focus:border-primary resize-y" />
                        <div className="flex items-center gap-2"><button onClick={submitOutcome} disabled={busy === "outcome"} className="text-[10px] px-3 py-1 rounded-md bg-primary text-primary-foreground font-semibold disabled:opacity-50">{busy === "outcome" ? "Saving…" : "Confirm & learn"}</button><button onClick={() => setOutcomeMode("")} className="text-[10px] text-muted-foreground">cancel</button></div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* CENTER — chat + composer */}
        <div className="rounded-2xl border border-border/70 bg-card shadow-sm flex flex-col min-h-0 min-w-0">
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border">
            <div className="w-8 h-8 rounded-full bg-primary/15 text-primary flex items-center justify-center text-sm font-bold ring-1 ring-primary/15">{(clientName || "?").slice(0, 1).toUpperCase()}</div>
            <div className="font-semibold text-sm tracking-tight truncate">{clientName}</div>
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
                <div className={`max-w-[80%] px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap break-words ${m.sender === "seller" ? "bg-primary/10 rounded-br-sm" : "bg-muted rounded-bl-sm"}`}>{m.text}</div>
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
            {conversation.trim() && (
              <div>
                <button onClick={genVariants} disabled={toolBusy === "variants"} className="text-[11px] px-2.5 py-1 rounded-md bg-primary/10 text-primary border border-primary/30 disabled:opacity-50">{toolBusy === "variants" ? "Thinking…" : "↺ More reply options"}</button>
                {variants.length > 0 && (
                  <div className="mt-1.5 space-y-1.5">
                    {variants.map((v, i) => (
                      <div key={i} className="rounded-lg border border-border p-2">
                        <div className="flex items-center justify-between mb-1"><span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{v.label}</span><button onClick={() => { setReplyDraft(v.text); copy(v.text); }} className="text-[10px] px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/30">Use &amp; copy</button></div>
                        <p className="text-xs whitespace-pre-wrap break-words text-foreground">{v.text}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            <textarea value={pasteInput} onChange={e => { setPasteInput(e.target.value); setNotice(""); }} placeholder="Paste new messages (or the whole chat). Duplicates are ignored." className="w-full h-16 px-3 py-2 rounded-xl border border-border bg-background text-sm outline-none focus:border-primary resize-y" />
            <div className="flex items-center gap-2 flex-wrap">
              <button onClick={() => addAndAnalyse(false)} disabled={analyzingIds.includes(selected?.id || "") || !pasteInput.trim()} className="text-xs px-4 py-1.5 rounded-lg bg-primary text-primary-foreground font-semibold disabled:opacity-50">{analyzingIds.includes(selected?.id || "") ? "Analysing…" : "Add & analyse"}</button>
              <label className="text-[11px] px-2.5 py-1 rounded-md bg-primary/10 text-primary border border-primary/30 cursor-pointer">{busy === "attach" ? "Adding…" : "📎 File"}<input type="file" accept=".txt,.md,.markdown,.csv,.tsv,.json,.html,.htm,.log,.xml,.yaml,.yml" className="hidden" onChange={e => attachFile(e.target.files?.[0])} disabled={busy === "attach"} /></label>
              <button onClick={() => setShowAttach(v => !v)} className="text-[11px] px-2.5 py-1 rounded-md bg-primary/10 text-primary border border-primary/30">🎙 Transcript</button>
              <label className="text-[11px] px-2.5 py-1 rounded-md bg-primary/10 text-primary border border-primary/30 cursor-pointer">📊 GSC<input type="file" accept=".csv,.tsv,.txt" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) f.text().then(t => attach(f.name || "GSC export", "gsc", t)).catch(() => setError("Could not read the file.")); }} disabled={busy === "attach"} /></label>
              <label className="text-[11px] px-2.5 py-1 rounded-md bg-primary/10 text-primary border border-primary/30 cursor-pointer">📈 GA4<input type="file" accept=".csv,.tsv,.txt" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) f.text().then(t => attach(f.name || "GA4 export", "ga4", t)).catch(() => setError("Could not read the file.")); }} disabled={busy === "attach"} /></label>
              <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground ml-auto"><input type="checkbox" checked={autoAnalyse} onChange={e => setAutoAnalyse(e.target.checked)} />Auto</label>
            </div>
            {showAttach && (<div><textarea value={transcript} onChange={e => setTranscript(e.target.value)} placeholder="Paste the call transcript (Fiverr recordings expire ~30 days — save it now)…" className="w-full h-20 px-2 py-1.5 rounded-lg border border-border bg-background text-xs outline-none focus:border-primary resize-y" /><button onClick={() => { if (transcript.trim()) { attach("call transcript", "transcript", transcript); setTranscript(""); setShowAttach(false); } }} disabled={busy === "attach" || !transcript.trim()} className="mt-1 text-[11px] px-3 py-1 rounded-lg bg-primary text-primary-foreground disabled:opacity-50">Add transcript</button></div>)}
          </div>
        </div>

        {/* RIGHT — advanced intelligence */}
        <div className="rounded-2xl border border-border/70 bg-card shadow-sm overflow-y-auto min-h-0 min-w-0">
          {(selected || conversation.trim()) && (
            <div className="px-4 pt-3.5 pb-3.5 border-b border-border/60">
              <div className="text-[10px] font-semibold text-primary uppercase tracking-[0.13em] mb-2 flex items-center gap-1.5"><span>✨</span> Ask the expert</div>
              <textarea value={askInput} onChange={e => setAskInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) ask(); }}
                placeholder="Ask anything — a client's technical question, your own thinking, what to propose. Grounded in this deal." className="w-full h-14 px-3 py-2 rounded-xl border border-border bg-background text-xs outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 transition-shadow resize-y" />
              <button onClick={ask} disabled={asking || !askInput.trim()} className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] px-3.5 py-1.5 rounded-lg bg-primary text-primary-foreground font-semibold shadow-sm hover:shadow disabled:opacity-50 disabled:shadow-none transition-shadow">{asking ? <><span className="w-3 h-3 rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground animate-spin" /> Thinking…</> : "Ask"}</button>
              {askResult && (
                <div className="mt-2 rounded-lg border border-border p-2 text-xs space-y-2">
                  <p className="whitespace-pre-wrap break-words text-foreground">{askResult.answer}</p>
                  {askResult.client_reply && (
                    <div className="rounded border border-primary/30 bg-primary/5 p-2">
                      <div className="flex items-center justify-between mb-1"><span className="text-[10px] font-semibold text-primary uppercase tracking-wider">Reply you can send</span><button onClick={() => { setReplyDraft(askResult.client_reply); copy(askResult.client_reply); }} className="text-[10px] px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/30">Use &amp; copy</button></div>
                      <p className="whitespace-pre-wrap break-words text-foreground">{askResult.client_reply}</p>
                    </div>
                  )}
                  {askResult.suggested_tools?.length > 0 && (
                    <div className="flex flex-wrap gap-1">{askResult.suggested_tools.map((t: string, i: number) => { const isAudit = /audit/i.test(t); return <button key={i} onClick={() => { if (isAudit) runAudit(); }} className="text-[10px] px-2 py-0.5 rounded-md bg-muted border border-border text-muted-foreground hover:border-primary">{isAudit ? `▶ ${t}` : t}</button>; })}</div>
                  )}
                </div>
              )}
            </div>
          )}
          {!strategy ? (
            <p className="text-xs text-muted-foreground p-4">{selected?.id ? "Paste this client's conversation in the center composer to analyse the lead. Once analysed, the detected site, deal facts, diagnostics (audit / AEO / competitor), offer, roadmap and case study all appear here — most of them firing automatically." : "Pick a lead or start a new one, then paste the conversation in the center. The intelligence — deal stage, what the client wants, the next move, an auto-run site audit, a call script, reminders and risks — fills in here. You never leave this page."}</p>
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

              {strategy?.next_move && <Acc open={open} toggle={toggle} k="next" title="Next best move"><div className="rounded-xl border border-primary/30 bg-primary/5 p-2.5 text-xs"><p className="text-foreground leading-relaxed">{strategy.next_move}</p><div className="mt-2">{(() => { const act = actionForText(strategy.next_move); return <button onClick={act.run} className="inline-flex items-center gap-1 text-[10px] font-medium px-2.5 py-1 rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-opacity">▶ {act.label}</button>; })()}</div></div></Acc>}

              {hasFacts && (
                <Acc open={open} toggle={toggle} k="facts" title="Deal facts" defaultBadge="captured from chat">
                  <div className="text-xs space-y-1.5">
                    {df.budget && <div><span className="text-muted-foreground">Budget:</span> <span className="text-foreground">{df.budget}</span></div>}
                    {df.timeline && <div><span className="text-muted-foreground">Timeline:</span> <span className="text-foreground">{df.timeline}</span></div>}
                    {df.platform && <div><span className="text-muted-foreground">Platform:</span> <span className="text-foreground">{df.platform}</span></div>}
                    {df.location && <div><span className="text-muted-foreground">Location:</span> <span className="text-foreground">{df.location}</span></div>}
                    {df.service && <div><span className="text-muted-foreground">Service:</span> <span className="text-foreground">{df.service}</span></div>}
                    {df.deliverables?.length > 0 && <div><span className="text-muted-foreground">Deliverables:</span><List items={df.deliverables} /></div>}
                    {df.urls?.length > 0 && <div><span className="text-muted-foreground">URLs:</span><List items={df.urls} /></div>}
                    {df.competitors?.length > 0 && <div><span className="text-muted-foreground">Competitors:</span><List items={df.competitors} /></div>}
                    {df.prices_discussed?.length > 0 && <div><span className="text-muted-foreground">Prices discussed:</span><List items={df.prices_discussed} /></div>}
                    {df.files_shared?.length > 0 && <div><span className="text-muted-foreground">Files referenced:</span><List items={df.files_shared} /></div>}
                    {df.key_dates?.length > 0 && <div><span className="text-muted-foreground">Key dates:</span><List items={df.key_dates} /></div>}
                    {df.other_facts?.length > 0 && <div><span className="text-muted-foreground">Other:</span><List items={df.other_facts} /></div>}
                  </div>
                </Acc>
              )}

              <Acc open={open} toggle={toggle} k="apps" title="Run a tool" defaultBadge="opens as a window">
                <div className="rounded-xl border border-border/60 bg-background/30 p-2.5 mb-2">
                  <div className="flex items-center justify-between mb-1.5"><span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.13em]">Client site</span>{clientSite && <span className="text-[9px] text-emerald-600">ready for audit</span>}</div>
                  <input value={siteInput} onChange={e => setSiteInput(e.target.value)} placeholder="yourclient.com — needed for audit & AEO" className="w-full px-2.5 py-1.5 rounded-lg border border-border bg-background text-[11px] font-mono outline-none focus:border-primary" />
                  {!clientSite && <p className="text-[10px] text-amber-600/90 mt-1">Audit and AEO need the client's website — paste it here (the chat did not include one).</p>}
                </div>
                <div className="grid grid-cols-2 gap-1.5 mb-2">
                  {([["audit", "🔍", "Site audit", () => runAudit()], ["aeo", "🤖", "AEO readiness", () => runAeo()], ["offer", "💰", "Offer & pricing", () => genOffer()], ["roadmap", "🗺", "30/60/90 plan", () => genRoadmap()], ["case", "📂", "Case study", () => matchCase()]] as const).map(([k, icon, label, fn]) => (
                    <button key={k} onClick={fn} className="group flex items-center gap-2 px-2.5 py-2 rounded-xl border border-border/60 bg-background/40 hover:border-primary/40 hover:bg-primary/[0.06] transition-all text-left">
                      <span className="w-6 h-6 rounded-lg bg-primary/10 ring-1 ring-primary/15 flex items-center justify-center text-[13px] shrink-0 group-hover:scale-105 transition-transform">{icon}</span>
                      <span className="text-[11px] font-medium tracking-tight text-foreground/90 truncate">{label}</span>
                    </button>
                  ))}
                  <button onClick={() => setShowCsLib(v => !v)} className="flex items-center gap-2 px-2.5 py-2 rounded-xl border border-dashed border-border/70 text-muted-foreground hover:border-primary/40 hover:text-foreground transition-all text-left"><span className="w-6 h-6 rounded-lg bg-muted flex items-center justify-center text-[13px] shrink-0">⚙</span><span className="text-[11px] font-medium tracking-tight truncate">Case library</span></button>
                </div>
                <div className="rounded-xl border border-border/60 bg-background/30 p-2.5">
                  <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.13em] mb-1.5">Competitor snapshot</div>
                  <input value={compCo} onChange={e => setCompCo(e.target.value)} placeholder={(df.competitors || []).length ? (df.competitors || []).join(", ") : "competitor1.com, competitor2.com"} className="w-full px-2.5 py-1.5 rounded-lg border border-border bg-background text-[11px] font-mono outline-none focus:border-primary mb-1.5" />
                  <input value={compKw} onChange={e => setCompKw(e.target.value)} placeholder="target keywords (prefilled from facts)" className="w-full px-2.5 py-1.5 rounded-lg border border-border bg-background text-[11px] outline-none focus:border-primary mb-2" />
                  <button onClick={() => runCompetitor()} className="w-full flex items-center justify-center gap-1.5 text-[11px] font-medium px-3 py-1.5 rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20 hover:bg-primary/15 transition-colors">⚔ Run snapshot</button>
                </div>
                {showCsLib && (
                  <div className="text-xs space-y-2 mt-2 rounded-lg border border-border p-2">
                    <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Case study library</div>
                    {caseLib.map(c => <div key={c.id} className="flex items-center justify-between gap-2 border-b border-border pb-1"><span className="truncate text-foreground">{c.title || "Untitled"}{c.industry ? ` · ${c.industry}` : ""}</span><button onClick={() => deleteCaseStudy(c.id)} className="text-muted-foreground hover:text-foreground">×</button></div>)}
                    <div className="space-y-1 pt-1">
                      <input value={csForm.title} onChange={e => setCsForm({ ...csForm, title: e.target.value })} placeholder="Title (e.g. Shopify store, +120% organic)" className="w-full px-2 py-1 rounded-md border border-border bg-background text-[11px] outline-none focus:border-primary" />
                      <textarea value={csForm.summary} onChange={e => setCsForm({ ...csForm, summary: e.target.value })} placeholder="What you did (real)" className="w-full h-12 px-2 py-1 rounded-md border border-border bg-background text-[11px] outline-none focus:border-primary resize-y" />
                      <textarea value={csForm.results} onChange={e => setCsForm({ ...csForm, results: e.target.value })} placeholder="Real results (numbers if you have them)" className="w-full h-12 px-2 py-1 rounded-md border border-border bg-background text-[11px] outline-none focus:border-primary resize-y" />
                      <input value={csForm.industry} onChange={e => setCsForm({ ...csForm, industry: e.target.value })} placeholder="Industry (e.g. interior design)" className="w-full px-2 py-1 rounded-md border border-border bg-background text-[11px] outline-none focus:border-primary" />
                      <input value={csForm.tags} onChange={e => setCsForm({ ...csForm, tags: e.target.value })} placeholder="tags: shopify, local seo, aeo" className="w-full px-2 py-1 rounded-md border border-border bg-background text-[11px] outline-none focus:border-primary" />
                      <button onClick={saveCaseStudy} className="text-[11px] px-3 py-1 rounded-lg bg-primary text-primary-foreground font-semibold">Add to library</button>
                    </div>
                  </div>
                )}
              </Acc>

              {intel && (intel.wants?.length || intel.pain_points?.length || intel.buying_signals?.length || intel.objections?.length || intel.budget_signals?.length) ? (
                <Acc open={open} toggle={toggle} k="client" title="Client intelligence">
                  {intel.wants?.length > 0 && <><div className="text-[11px] font-semibold text-muted-foreground mt-1">Wants</div><List items={intel.wants} /></>}
                  {intel.pain_points?.length > 0 && <><div className="text-[11px] font-semibold text-muted-foreground mt-1.5">Pain points</div><List items={intel.pain_points} /></>}
                  {intel.buying_signals?.length > 0 && <><div className="text-[11px] font-semibold text-muted-foreground mt-1.5">Buying signals</div><List items={intel.buying_signals} /></>}
                  {intel.objections?.length > 0 && <><div className="text-[11px] font-semibold text-muted-foreground mt-1.5">Objections</div><List items={intel.objections} /></>}
                  {intel.budget_signals?.length > 0 && <><div className="text-[11px] font-semibold text-muted-foreground mt-1.5">Budget signals</div><List items={intel.budget_signals} /></>}
                </Acc>
              ) : null}

              {strategy?.action_items?.length > 0 && <Acc open={open} toggle={toggle} k="actions" title="Do now" defaultBadge={strategy.action_items.filter((a: any) => !doneActions.includes(a.action)).length}>
                <div className="space-y-1.5">
                  {strategy.action_items.map((a: any, i: number) => {
                    const done = doneActions.includes(a.action);
                    const act = actionForText(a.action);
                    return (
                      <div key={i} className={`rounded-xl border p-2 transition-opacity ${done ? "border-border/40 opacity-50" : "border-border/60"}`}>
                        <div className="flex items-start gap-2">
                          <button onClick={() => setDoneActions(d => done ? d.filter(x => x !== a.action) : [...d, a.action])} className={`mt-0.5 w-4 h-4 rounded-md border flex items-center justify-center text-[10px] shrink-0 transition-colors ${done ? "bg-emerald-500 border-emerald-500 text-white" : "border-border hover:border-primary"}`}>{done ? "✓" : ""}</button>
                          <div className="min-w-0 flex-1">
                            <div className={`text-xs text-foreground ${done ? "line-through" : ""}`}>{a.action}</div>
                            {a.why && <div className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">{a.why}</div>}
                          </div>
                        </div>
                        {!done && <div className="flex items-center gap-1.5 mt-1.5 pl-6"><button onClick={act.run} className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-md bg-primary/10 text-primary ring-1 ring-primary/20 hover:bg-primary/15 transition-colors">▶ {act.label}</button>{a.platform_can_help && <span className="text-[9px] text-emerald-600">in-platform</span>}</div>}
                      </div>
                    );
                  })}
                </div>
              </Acc>}

              {strategy?.reminders?.length > 0 && <Acc open={open} toggle={toggle} k="reminders" title="Reminders" defaultBadge={strategy.reminders.length}>
                <div className="space-y-1.5">
                  {strategy.reminders.map((r: any, i: number) => (
                    <div key={i} className="rounded-xl border border-border/60 p-2">
                      <div className="text-xs text-foreground">⏰ {r.text}{r.when ? <span className="text-muted-foreground"> — {r.when}</span> : null}</div>
                      <div className="mt-1.5"><button onClick={() => askQuestion(`Draft a short, friendly follow-up message I can send the client for this reminder: ${r.text}`)} className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-md bg-primary/10 text-primary ring-1 ring-primary/20 hover:bg-primary/15 transition-colors">✍ Draft follow-up</button></div>
                    </div>
                  ))}
                </div>
              </Acc>}

              {strategy?.call_script?.needed && (
                <Acc open={open} toggle={toggle} k="call" title="Call script">
                  <div className="text-xs text-muted-foreground space-y-1">
                    {strategy.call_script.opening && <p><b className="text-foreground">Open:</b> {strategy.call_script.opening}</p>}
                    {strategy.call_script.discovery_questions?.length > 0 && <div><b className="text-foreground">Ask:</b><List items={strategy.call_script.discovery_questions} /></div>}
                    {strategy.call_script.objection_handling?.length > 0 && <div><b className="text-foreground">Objections:</b><List items={strategy.call_script.objection_handling} /></div>}
                    {strategy.call_script.close && <p><b className="text-foreground">Close:</b> {strategy.call_script.close}</p>}
                  </div>
                  <button onClick={() => copy([strategy.call_script.opening ? `Open: ${strategy.call_script.opening}` : "", (strategy.call_script.discovery_questions || []).length ? `Ask:\n- ${strategy.call_script.discovery_questions.join("\n- ")}` : "", (strategy.call_script.objection_handling || []).length ? `Objections:\n- ${strategy.call_script.objection_handling.join("\n- ")}` : "", strategy.call_script.close ? `Close: ${strategy.call_script.close}` : ""].filter(Boolean).join("\n\n"))} className="mt-2 inline-flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-md bg-primary/10 text-primary ring-1 ring-primary/20 hover:bg-primary/15 transition-colors">⧉ Copy script</button>
                </Acc>
              )}

              {strategy?.risk_flags?.length > 0 && <Acc open={open} toggle={toggle} k="risks" title="Watch out" defaultBadge={strategy.risk_flags.length}><div className="rounded-lg border p-2" style={{ borderColor: "#f59e0b55", background: "#f59e0b11" }}><List items={strategy.risk_flags} /></div></Acc>}

              {strategy?.needs_attachments?.length > 0 && <Acc open={open} toggle={toggle} k="needs" title="Add what the chat references">
                <div className="space-y-1.5">
                  {strategy.needs_attachments.map((a: any, i: number) => (
                    <div key={i} className="rounded-xl border p-2 text-xs" style={{ borderColor: "#6366f155", background: "#6366f111" }}>
                      <div className="text-muted-foreground">📎 {a.what}{a.note ? ` — ${a.note}` : ""}</div>
                      <div className="mt-1.5"><button onClick={() => askQuestion(`Write a short, polite message asking the client to share this so I can proceed: ${a.what}`)} className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-md bg-primary/10 text-primary ring-1 ring-primary/20 hover:bg-primary/15 transition-colors">✍ Draft request</button></div>
                    </div>
                  ))}
                </div>
              </Acc>}

              {selected?.id && (selected.attachments || []).length > 0 && (
                <Acc open={open} toggle={toggle} k="lead" title="Attachments">
                  <div className="flex flex-wrap gap-1">{selected.attachments.map((a: any, i: number) => <Chip key={i} text={`📎 ${a.name}`} color="#10b981" />)}</div>
                </Acc>
              )}
            </div>
          )}
        </div>
      </div>
      {focusedWindow && <WinManager win={focusedWindow} onMin={() => setFocusedWin("")} onClose={() => closeWin(focusedWindow.id)} onDownload={() => downloadWin(focusedWindow)} onUseReply={useReply} />}
      <WinTaskbar windows={windows} onRestore={restoreWin} onClose={closeWin} onClearDone={clearDoneWins} />
    </div>
  );
}
