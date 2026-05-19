import { useState, useRef, useEffect } from "react";
import PortalNav from "@/components/PortalNav";

const post = (a: string, b: any = {}) =>
  fetch("/api/task-engine", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: a, ...b }),
  }).then(r => r.json()).catch(() => ({}));

const SEV_COLOR: any = { critical:"#ef4444", high:"#f97316", medium:"#f59e0b", low:"#10b981" };
const CAT_COLOR: any = { emphasis:"#6366f1", omit:"#ef4444", tone:"#10b981", focus:"#f59e0b", strategy:"#a78bfa" };

export default function Intake() {
  const [url,         setUrl]         = useState("");
  const [email,       setEmail]       = useState("");
  const [name,        setName]        = useState("");
  const [audit,       setAudit]       = useState<any>(null);
  const [pack,        setPack]        = useState<any>(null);
  const [step,        setStep]        = useState<"url"|"audit"|"pack"|"done">("url");
  const [loading,     setLoading]     = useState(false);
  const [packLoad,    setPackLoad]    = useState(false);
  const [progress,    setProgress]    = useState<{pct:number;msg:string}|null>(null);
  const [error,       setError]       = useState("");
  // Context panel
  const [salesContext, setSalesContext] = useState("");
  const [ctxSuggestions, setCtxSuggestions] = useState<any[]>([]);
  const [loadingSugg,   setLoadingSugg]   = useState(false);
  const [saved,          setSaved]          = useState(false);
  const [prevSession,    setPrevSession]    = useState<any>(null);
  const auditRef = useRef<HTMLDivElement>(null);
  const packRef  = useRef<HTMLDivElement>(null);
  const ctxRef   = useRef<HTMLTextAreaElement>(null);

  // Auto-load previous session when URL entered
  useEffect(() => {
    if (!url.trim() || url.length < 6) return;
    const t = setTimeout(async () => {
      const r = await post("load_intake_session", { url: url.trim() });
      if ((r as any).found) setPrevSession(r as any);
    }, 800);
    return () => clearTimeout(t);
  }, [url]);

  const autoSave = async (overrides: any = {}) => {
    if (!audit && !pack) return;
    await post("save_intake_session", {
      url, salesContext, auditResult: audit, pack, email, name, ...overrides
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const loadSuggestions = async () => {
    if (!audit) return;
    setLoadingSugg(true); setCtxSuggestions([]);
    const r = await post("generate_context_suggestions", { auditResult: audit, url, currentContext: salesContext });
    setCtxSuggestions((r as any).suggestions || []);
    setLoadingSugg(false);
  };

  const addSuggestion = (text: string) => {
    setSalesContext(prev => prev ? prev + "\n" + text : text);
    setTimeout(() => ctxRef.current?.focus(), 100);
  };

  const runAudit = async () => {
    if (!url.trim()) return;
    setLoading(true); setError(""); setAudit(null); setPack(null);
    const auditSteps = [
      { pct:8,  msg:"Fetching " + url.trim().replace(/^https?:\/\//,"").split("/")[0] + "…" },
      { pct:22, msg:"Reading page structure and content…" },
      { pct:38, msg:"Checking title tags, meta descriptions, headings…" },
      { pct:52, msg:"Analysing technical SEO signals…" },
      { pct:65, msg:"Cross-referencing algorithm updates…" },
      { pct:78, msg:"Scoring against ranking factors…" },
      { pct:90, msg:"Applying your sales context…" },
    ];
    let si = 0; setProgress(auditSteps[0]);
    const ticker = setInterval(() => { si=Math.min(si+1,auditSteps.length-1); setProgress(auditSteps[si]); }, 2000);
    const r = await post("instant_audit_showcase", { url: url.trim(), salesContext });
    clearInterval(ticker);
    setProgress({ pct:100, msg:"Audit complete ✓" });
    await new Promise(res => setTimeout(res, 600));
    setProgress(null);
    if ((r as any).error) { setError((r as any).error); setLoading(false); return; }
    setAudit(r);
    setLoading(false);
    setStep("audit");
    setTimeout(() => auditRef.current?.scrollIntoView({ behavior:"smooth" }), 100);
    // Auto-load context suggestions after audit
    post("generate_context_suggestions", { auditResult: r, url: url.trim(), currentContext: salesContext })
      .then(rs => setCtxSuggestions((rs as any).suggestions || []));
    autoSave({ auditResult: r });
  };

  const generatePack = async () => {
    setPackLoad(true); setPack(null);
    const packSteps = [
      { pct:10, msg:"Analysing audit findings…" },
      { pct:28, msg:"Building case study…" },
      { pct:45, msg:"Writing pitch script…" },
      { pct:62, msg:"Creating objection handlers…" },
      { pct:78, msg:"Applying your sales context…" },
      { pct:90, msg:"Finalising sales pack…" },
    ];
    let si=0; setProgress(packSteps[0]);
    const ticker=setInterval(()=>{si=Math.min(si+1,packSteps.length-1);setProgress(packSteps[si]);},2000);
    const r = await post("generate_sales_pack", { auditResult: audit, url, salesContext });
    clearInterval(ticker);
    setProgress({ pct:100, msg:"Sales pack ready ✓" });
    await new Promise(res => setTimeout(res, 600));
    setProgress(null);
    if ((r as any).success) {
      setPack((r as any).pack);
      setStep("pack");
      setTimeout(() => packRef.current?.scrollIntoView({ behavior:"smooth" }), 100);
      autoSave({ pack: (r as any).pack });
    } else {
      setError((r as any).error || "Sales pack generation failed");
    }
    setPackLoad(false);
  };

  const captureLead = async () => {
    if (!email.trim()) { setError("Email required"); return; }
    setLoading(true);
    await post("capture_lead", { url, email:email.trim(), name:name.trim(), source:"intake", auditResult:audit });
    setLoading(false);
    setStep("done");
    autoSave();
  };

  const downloadAsPDF = (content: string, filename: string) => {
    const win = window.open("","_blank");
    if (!win) { alert("Allow popups to download PDF"); return; }
    win.document.write(content); win.document.close(); win.focus();
    setTimeout(() => { win.print(); win.onafterprint = () => win.close(); }, 500);
  };
  const downloadAsDoc = (content: string, filename: string) => {
    const blob = new Blob([content],{type:"application/msword"});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename.replace(/\.html$/,".doc"); a.click();
    URL.revokeObjectURL(a.href);
  };

  const printCSS = `@media print{body{max-width:100%;margin:0;padding:20px;-webkit-print-color-adjust:exact;print-color-adjust:exact;}@page{size:A4;margin:1.5cm;}}`;

  const auditHTML = () => {
    if (!audit) return "";
    const sev = (s:string) => ({critical:"#dc2626",high:"#ea580c",medium:"#d97706",low:"#16a34a"}[s]||"#6366f1");
    const cats = (audit.categories||[]).map((c:any)=>
      `<section style="margin-bottom:32px;page-break-inside:avoid;">
        <div style="display:flex;justify-content:space-between;align-items:baseline;border-bottom:2px solid #1B4080;padding-bottom:8px;margin-bottom:16px;">
          <h2 style="margin:0;font-size:16px;font-weight:700;color:#1B4080;">${c.name}</h2>
          <span style="font-size:24px;font-weight:900;color:${c.score>=70?"#dc2626":c.score>=50?"#d97706":"#16a34a"}">${c.score}<span style="font-size:13px;font-weight:400;color:#94a3b8;">/100</span></span>
        </div>
        ${c.narrative?`<p style="font-size:14px;color:#475569;line-height:1.7;margin:0 0 20px;font-style:italic;">${c.narrative}</p>`:""}
        ${(c.issues||[]).map((i:any)=>`
          <div style="margin-bottom:16px;padding:16px 20px;border-left:4px solid ${sev(i.severity)};background:${sev(i.severity)}08;border-radius:0 8px 8px 0;">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
              <span style="font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#fff;background:${sev(i.severity)};padding:2px 8px;border-radius:4px;">${i.severity}</span>
              <strong style="font-size:14px;color:#1e293b;">${i.issue}</strong>
            </div>
            ${i.explanation?`<p style="font-size:13px;color:#475569;line-height:1.65;margin:0 0 10px;">${i.explanation}</p>`:""}
            <div style="font-size:13px;background:rgba(0,0,0,0.03);padding:10px 14px;border-radius:6px;">
              <strong style="color:#1B4080;">Recommended fix:</strong> <span style="color:#334155;">${i.fix}</span>
            </div>
            ${i.algorithmNote?`<div style="font-size:12px;color:#6366f1;margin-top:8px;">⚡ ${i.algorithmNote}</div>`:""}
          </div>`).join("")}
      </section>`).join("");
    const ctxBanner = ""; // Never shown in client document
    const summaryBlock = audit.executiveSummary ? `<div style="margin-bottom:32px;padding:20px 24px;background:#f8fafc;border-radius:10px;border-left:5px solid #1B4080;"><h2 style="margin:0 0 10px;font-size:14px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#1B4080;">Executive Summary</h2><p style="font-size:15px;color:#1e293b;line-height:1.75;margin:0;">${audit.executiveSummary}</p></div>` : "";
    const printCSS = "@media print{body{max-width:100%;margin:0;padding:20px;-webkit-print-color-adjust:exact;print-color-adjust:exact;}@page{size:A4;margin:1.5cm;}.no-print{display:none;}}";
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>SEO Audit — ${url}</title>
      <style>
        *{box-sizing:border-box;}
        body{font-family:'Segoe UI',system-ui,-apple-system,sans-serif;max-width:820px;margin:40px auto;padding:0 28px;color:#1e293b;line-height:1.6;background:#fff;}
        h1,h2,h3{font-weight:700;line-height:1.3;}
        section{margin-bottom:32px;}
        ${printCSS}
      </style></head><body>
      <div style="background:linear-gradient(135deg,#1B4080,#0f2655);color:#fff;padding:32px 36px;border-radius:12px;margin-bottom:32px;">
        <div style="font-size:10px;letter-spacing:3px;opacity:0.6;text-transform:uppercase;margin-bottom:8px;font-weight:600;">SEO Season · Manav S · Confidential</div>
        <h1 style="margin:0 0 6px;font-size:28px;font-weight:300;color:#fff;letter-spacing:-0.5px;">SEO Audit Report</h1>
        <div style="font-size:14px;opacity:0.75;margin-bottom:20px;">${url}</div>
        <div style="display:flex;gap:32px;align-items:flex-end;">
          <div><div style="font-size:11px;opacity:0.6;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Overall Score</div>
            <div style="font-size:52px;font-weight:900;line-height:1;color:${(audit.score||0)>=70?"#fca5a5":(audit.score||0)>=50?"#fcd34d":"#86efac"}">${audit.score||0}<span style="font-size:20px;opacity:0.5;">/100</span></div></div>
          <div style="flex:1;max-width:300px;">
            <div style="font-size:11px;opacity:0.6;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">Quick Wins</div>
            ${(audit.quickWins||[]).map((w:string)=>`<div style="font-size:13px;margin-bottom:5px;opacity:0.9;">✓ ${w}</div>`).join("")}
          </div>
          <div style="text-align:right;opacity:0.6;font-size:13px;">${new Date().toLocaleDateString("en-GB",{day:"numeric",month:"long",year:"numeric"})}</div>
        </div>
      </div>
      ${ctxBanner}
      ${summaryBlock}
      ${cats}
      ${(audit.algorithmHighlights||[]).length?`<section style="padding:20px 24px;background:#eef4ff;border-radius:10px;">
        <h2 style="margin:0 0 12px;font-size:14px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#3730a3;">Algorithm Context</h2>
        ${(audit.algorithmHighlights||[]).map((a:string)=>`<div style="font-size:13px;color:#3730a3;margin-bottom:6px;padding-left:16px;border-left:3px solid #6366f1;">◆ ${a}</div>`).join("")}
      </section>`:""}
      <div style="margin-top:40px;padding-top:16px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;font-size:11px;color:#94a3b8;">
        <span><strong style="color:#1B4080;font-weight:700;">Manav S</strong> · SEO Season · seoseason.com</span>
        <span>Prepared exclusively for ${url}</span>
      </div></body></html>`;
  };;

  const packHTML = () => {
    if (!pack) return "";
    const qwp = (pack.quickWinPlan||"").split("|").map((s:string)=>s.trim()).filter(Boolean);
    const ctx = ""; // Never shown in client document
    const proposal = (pack.proposalPoints||[]).map((p:any)=>
      `<div style="margin-bottom:14px;padding:14px;background:#f8fafc;border-radius:6px;border-left:3px solid #6366f1;"><strong style="color:#1B4080;">${p.heading}</strong><p style="margin:6px 0 0;color:#475569;font-size:13px;">${p.body}</p></div>`).join("");
    const objections = (pack.objectionHandlers||[]).map((o:any)=>
      `<div style="margin-bottom:12px;padding:12px;background:#fef2f2;border-radius:6px;border-left:3px solid #ef4444;"><strong style="color:#dc2626;">Objection: ${o.objection}</strong><p style="margin:6px 0 0;font-size:13px;color:#475569;">${o.response}</p></div>`).join("");
    const followup = (pack.followUpSequence||[]).map((f:any)=>
      `<div style="margin-bottom:10px;padding:12px;background:#f1f5f9;border-radius:6px;"><strong>Day ${f.day}:</strong><p style="margin:4px 0 0;font-size:13px;color:#475569;">${f.message}</p></div>`).join("");
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Sales Pack — ${url}</title>
      <style>body{font-family:'Segoe UI',system-ui,sans-serif;max-width:800px;margin:40px auto;padding:0 24px;color:#1e293b;line-height:1.6;}h1,h2{color:#1B4080;}${printCSS}</style>
      </head><body>
      <div style="background:#1B4080;color:#fff;padding:24px 28px;border-radius:8px;margin-bottom:24px;">
        <div style="font-size:11px;letter-spacing:2px;opacity:0.7;text-transform:uppercase;margin-bottom:6px;">SEO Season · Manav S</div>
        <h1 style="margin:0 0 8px;font-size:24px;font-weight:300;color:#fff;">Sales Pack</h1>
        <div style="font-size:13px;opacity:0.8;">${url} · ${new Date().toLocaleDateString("en-GB",{day:"numeric",month:"long",year:"numeric"})}</div>
      </div>
      ${ctx}
      <h2>Executive Summary</h2><p style="font-size:14px;">${pack.executiveSummary||""}</p>
      ${pack.caseStudy?`<div style="padding:16px;background:#f0fdf4;border-radius:8px;border-left:4px solid #10b981;margin:16px 0;"><h2 style="margin:0 0 10px;">📊 Case Study: ${pack.caseStudy.title}</h2><p><strong>Situation:</strong> ${pack.caseStudy.situation}</p><p><strong>Approach:</strong> ${pack.caseStudy.approach}</p><p style="color:#059669;"><strong>Result:</strong> ${pack.caseStudy.result}</p><p style="font-style:italic;color:#059669;">${pack.caseStudy.relevance}</p></div>`:""}
      <h2>Pitch Script</h2>
      <div style="padding:16px;background:#faf5ff;border-radius:8px;border-left:4px solid #6366f1;white-space:pre-wrap;font-size:13px;">${pack.pitchScript||""}</div>
      <h2>Proposal Points</h2>${proposal}
      <h2>Objection Handlers</h2>${objections}
      <h2>Follow-up Sequence</h2>${followup}
      <h2>First 7 Days Plan</h2><ul>${qwp.map(b=>"<li style='margin-bottom:6px;font-size:13px;'>"+b+"</li>").join("")}</ul>
      <div style="margin-top:32px;padding-top:16px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;font-size:11px;color:#94a3b8;">
        <span><strong style="color:#1B4080;">Manav S</strong> · SEO Season</span>
        <span>Prepared exclusively for ${url}</span>
      </div></body></html>`;
  };

  const progressBarJSX = !progress ? null : (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="w-full max-w-md mx-6 rounded-2xl border border-border bg-card p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-semibold">{progress.msg}</span>
          <span className="text-sm font-bold text-primary">{progress.pct}%</span>
        </div>
        <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all duration-700"
            style={{ width: progress.pct+"%", background: progress.pct===100 ? "hsl(var(--primary))" : "linear-gradient(90deg,hsl(var(--primary)),hsl(var(--primary)/0.6))" }}/>
        </div>
        {progress.pct < 100 && <div className="flex gap-1.5 mt-4 justify-center">{[0,1,2].map(i=>(
          <div key={i} className="w-1.5 h-1.5 rounded-full bg-primary/60" style={{animation:`pulse 1.2s ease-in-out ${i*0.2}s infinite`}}/>
        ))}</div>}
      </div>
    </div>
  );

  const contextPanelJSX = (
    <div className="rounded-2xl border border-border bg-card p-5 mb-6">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-sm font-bold">🎯 Sales Context</div>
          <div className="text-xs text-muted-foreground mt-0.5">Guide the audit and all documents. What to emphasise, omit, or customise.</div>
        </div>
        <div className="flex items-center gap-2">
          {saved && <span className="text-xs text-green-400">✓ Auto-saved</span>}
          {audit && (
            <button onClick={loadSuggestions} disabled={loadingSugg}
              className="px-3 py-1.5 rounded-lg border border-border text-xs font-medium hover:border-primary/40 disabled:opacity-50">
              {loadingSugg ? "Loading…" : "✨ Smart Suggestions"}
            </button>
          )}
        </div>
      </div>
      <textarea
        ref={ctxRef}
        className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm outline-none focus:border-primary resize-none"
        rows={3}
        placeholder={"e.g. Focus on competitor threat from Amazon. Skip technical jargon — client is non-technical. Emphasise the urgency of Core Web Vitals. Don't mention the blog section."}
        value={salesContext}
        onChange={e => setSalesContext(e.target.value)}
        onBlur={() => audit && autoSave()}
      />
      {ctxSuggestions.length > 0 && (
        <div className="mt-3">
          <div className="text-xs font-semibold text-muted-foreground mb-2">Suggested additions — click to include:</div>
          <div className="flex flex-wrap gap-2">
            {ctxSuggestions.map((s:any, i:number) => (
              <button key={i} onClick={() => addSuggestion(s.text)}
                className="px-3 py-1 rounded-lg text-xs font-medium border transition-all hover:scale-105"
                style={{ borderColor: CAT_COLOR[s.category]+"40", color: CAT_COLOR[s.category], background: CAT_COLOR[s.category]+"10" }}
                title={s.text}>
                {s.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const downloadButtonsFn = (htmlFn:()=>string, fname:string) => (
    <div className="flex gap-2">
      <button onClick={() => downloadAsPDF(htmlFn(), fname+".pdf")}
        className="px-3 py-1.5 rounded-lg border border-border text-xs font-medium hover:border-primary/40">⬇ PDF</button>
      <button onClick={() => downloadAsDoc(htmlFn(), fname+".doc")}
        className="px-3 py-1.5 rounded-lg border border-border text-xs font-medium hover:border-primary/40">⬇ Word</button>
    </div>
  );

  const slug = url.replace(/[^a-z0-9]/gi,"_").slice(0,30);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {progressBarJSX}
      <PortalNav />
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold mb-1">Lead Intake</h1>
          <p className="text-sm text-muted-foreground">Audit a prospect, generate a sales pack, and capture the lead — all customised to your sales strategy.</p>
        </div>

        {/* Previous session notice */}
        {prevSession?.found && !audit && (
          <div className="mb-4 p-4 rounded-xl border border-green-500/30 bg-green-500/5 flex items-center justify-between">
            <div className="text-sm">
              <span className="font-semibold text-green-400">Previous session found</span>
              <span className="text-muted-foreground text-xs ml-2">saved {new Date(prevSession.session?.savedAt).toLocaleDateString()}</span>
            </div>
            <button onClick={() => {
              setSalesContext(prevSession.session?.salesContext||"");
              if(prevSession.session?.auditResult){ setAudit(prevSession.session.auditResult); setStep("audit"); }
              if(prevSession.session?.pack){ setPack(prevSession.session.pack); setStep("pack"); }
            }} className="text-xs px-3 py-1.5 rounded-lg bg-green-500/10 text-green-400 border border-green-500/30 hover:bg-green-500/20">
              ↩ Restore session
            </button>
          </div>
        )}

        {/* URL input */}
        <div className="rounded-2xl border border-border bg-card p-5 mb-6">
          <div className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wider">Website URL</div>
          <div className="flex gap-3">
            <input className="flex-1 px-4 py-2.5 rounded-xl border border-border bg-background text-sm outline-none focus:border-primary"
              placeholder="yourprospect.com" value={url} onChange={e=>{setUrl(e.target.value);setSaved(false);}}
              onKeyDown={e=>e.key==="Enter"&&runAudit()} />
            <button onClick={runAudit} disabled={loading||!url.trim()}
              className="px-6 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-50">
              {loading?"Running…":"Run Audit"}
            </button>
          </div>
          {error&&<p className="text-xs text-red-400 mt-2">{error}</p>}
        </div>

        {/* Sales Context panel — always visible once URL entered */}
        {url.trim().length > 5 && contextPanelJSX}

        {/* Audit results */}
        {audit && (
          <div ref={auditRef} className="rounded-2xl border border-border bg-card p-5 mb-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">SEO Audit</div>
                <div className="text-base font-semibold">{url}</div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-center">
                  <div className={`text-3xl font-black ${(audit.score||0)>=70?"text-red-400":(audit.score||0)>=50?"text-yellow-400":"text-green-400"}`}>{audit.score||0}</div>
                  <div className="text-xs text-muted-foreground">/100</div>
                </div>
                {downloadButtonsFn(auditHTML, "audit-"+slug)}
              </div>
            </div>

            {/* Quick wins */}
            {(audit.quickWins||[]).length>0&&(
              <div className="mb-5 p-4 rounded-xl bg-green-500/5 border border-green-500/20">
                <div className="text-xs font-bold text-green-400 uppercase tracking-wider mb-2">⚡ Quick Wins</div>
                <div className="grid grid-cols-1 gap-1.5">
                  {audit.quickWins.map((w:string,i:number)=>(
                    <div key={i} className="text-xs text-muted-foreground flex items-start gap-2">
                      <span className="text-green-400 shrink-0 mt-0.5">✓</span>{w}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Executive Summary */}
            {audit.executiveSummary && (
              <div className="mb-5 p-4 rounded-xl border border-border bg-card/50">
                <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Executive Summary</div>
                <p className="text-sm leading-relaxed text-foreground">{audit.executiveSummary}</p>
              </div>
            )}

            {/* What Changed — BDE only, never in client documents */}
            {audit.contextSummary && salesContext && (
              <div className="mb-5 p-4 rounded-xl border border-amber-500/30 bg-amber-500/5">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-amber-400">✦</span>
                  <div className="text-xs font-bold text-amber-400 uppercase tracking-wider">Context Applied — What Changed</div>
                  <span className="text-xs text-muted-foreground ml-auto italic">Not visible in client document</span>
                </div>
                <p className="text-xs text-amber-300/90 leading-relaxed">{audit.contextSummary}</p>
              </div>
            )}

            {/* Categories */}
            <div className="space-y-4">
              {(audit.categories||[]).map((cat:any,ci:number)=>(
                <div key={ci} className="border border-border rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-semibold">{cat.name}</span>
                    <span className={`text-sm font-bold ${cat.score>=70?"text-red-400":cat.score>=50?"text-yellow-400":"text-green-400"}`}>{cat.score}/100</span>
                  </div>
                  <div className="space-y-2">
                    {(cat.issues||[]).map((issue:any,ii:number)=>(
                      <div key={ii} className="text-xs p-3 rounded-lg"
                        style={{background:`${SEV_COLOR[issue.severity]||"#6366f1"}10`,borderLeft:`2px solid ${SEV_COLOR[issue.severity]||"#6366f1"}`}}>
                        <div className="font-semibold mb-1" style={{color:SEV_COLOR[issue.severity]||"#6366f1"}}>[{issue.severity}] {issue.issue}</div>
                        {issue.explanation && <div className="text-muted-foreground mb-1.5 leading-relaxed">{issue.explanation}</div>}
                        <div className="text-muted-foreground"><span className="font-semibold text-foreground">Fix: </span>{issue.fix}</div>
                        {issue.algorithmNote&&<div className="mt-1 text-primary">⚡ {issue.algorithmNote}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Algorithm */}
            {(audit.algorithmHighlights||[]).length>0&&(
              <div className="mt-4 p-4 rounded-xl border border-primary/20 bg-primary/5">
                <div className="text-xs font-bold text-primary uppercase tracking-wider mb-2">Algorithm Context</div>
                {audit.algorithmHighlights.map((a:string,i:number)=>(
                  <div key={i} className="text-xs text-muted-foreground flex items-start gap-2 mb-1">
                    <span className="text-primary shrink-0">◆</span>{a}
                  </div>
                ))}
              </div>
            )}

            {/* Regenerate + Sales Pack CTA */}
            <div className="mt-5 pt-5 border-t border-border flex items-center justify-between flex-wrap gap-3">
              <button onClick={runAudit} disabled={loading}
                className="px-4 py-2 rounded-xl border border-border text-xs font-medium hover:border-primary/40 disabled:opacity-50">
                ↺ Regenerate with context
              </button>
              <button onClick={generatePack} disabled={packLoad}
                className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-50">
                {packLoad?"Generating…":"✨ Generate Sales Pack"}
              </button>
            </div>
          </div>
        )}

        {/* Sales Pack */}
        {pack && (
          <div ref={packRef} className="rounded-2xl border border-border bg-card p-5 mb-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Sales Pack</div>
                <div className="text-base font-semibold">{url}</div>
              </div>
              <div className="flex items-center gap-3">
                {downloadButtonsFn(packHTML, "sales-pack-"+slug)}
                <button onClick={generatePack} disabled={packLoad}
                  className="px-3 py-1.5 rounded-lg border border-border text-xs font-medium hover:border-primary/40">
                  ↺ Regenerate
                </button>
              </div>
            </div>

            {/* Executive Summary */}
            <div className="mb-5 p-4 rounded-xl bg-primary/5 border border-primary/20">
              <div className="text-xs font-bold text-primary uppercase tracking-wider mb-2">Executive Summary</div>
              <p className="text-sm text-muted-foreground leading-relaxed">{pack.executiveSummary}</p>
            </div>

            {/* Case Study */}
            {pack.caseStudy&&(
              <div className="mb-5 p-4 rounded-xl bg-green-500/5 border border-green-500/20">
                <div className="text-xs font-bold text-green-400 uppercase tracking-wider mb-3">📊 Case Study</div>
                <div className="text-sm font-semibold mb-3">{pack.caseStudy.title}</div>
                <div className="space-y-2 text-xs text-muted-foreground">
                  <div><span className="font-semibold text-foreground">Situation: </span>{pack.caseStudy.situation}</div>
                  <div><span className="font-semibold text-foreground">Approach: </span>{pack.caseStudy.approach}</div>
                  <div><span className="font-semibold text-green-400">Result: </span>{pack.caseStudy.result}</div>
                  <div className="italic text-green-400">{pack.caseStudy.relevance}</div>
                </div>
              </div>
            )}

            {/* Pitch Script */}
            {pack.pitchScript&&(
              <div className="mb-5">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Pitch Script</div>
                  <button onClick={()=>navigator.clipboard.writeText(pack.pitchScript).catch(()=>{})} className="text-xs text-primary hover:underline">Copy</button>
                </div>
                <div className="p-4 rounded-xl bg-violet-500/5 border border-violet-500/20 text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">{pack.pitchScript}</div>
              </div>
            )}

            {/* Proposal Points */}
            {(pack.proposalPoints||[]).length>0&&(
              <div className="mb-5">
                <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Proposal Points</div>
                <div className="space-y-3">
                  {pack.proposalPoints.map((p:any,i:number)=>(
                    <div key={i} className="p-3 rounded-xl border border-border">
                      <div className="text-xs font-semibold mb-1">{p.heading}</div>
                      <div className="text-xs text-muted-foreground">{p.body}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Objection Handlers */}
            {(pack.objectionHandlers||[]).length>0&&(
              <div className="mb-5">
                <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Objection Handlers</div>
                <div className="space-y-3">
                  {pack.objectionHandlers.map((o:any,i:number)=>(
                    <div key={i} className="p-3 rounded-xl border border-red-500/20 bg-red-500/5">
                      <div className="text-xs font-semibold text-red-400 mb-1">"{o.objection}"</div>
                      <div className="text-xs text-muted-foreground">{o.response}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Follow-up Sequence */}
            {(pack.followUpSequence||[]).length>0&&(
              <div className="mb-5">
                <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Follow-up Sequence</div>
                <div className="space-y-3">
                  {pack.followUpSequence.map((f:any,i:number)=>(
                    <div key={i} className="flex gap-3 items-start">
                      <div className="shrink-0 w-12 h-6 rounded-lg bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">Day {f.day}</div>
                      <div className="flex-1 p-3 rounded-xl border border-border text-xs text-muted-foreground">{f.message}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Quick Win Plan */}
            {pack.quickWinPlan&&(
              <div className="mb-5 p-4 rounded-xl bg-green-500/5 border border-green-500/20">
                <div className="text-xs font-bold text-green-400 uppercase tracking-wider mb-2">First 7 Days</div>
                <ul className="space-y-1.5">
                  {(pack.quickWinPlan||"").split("|").map((b:string,i:number)=>b.trim()&&(
                    <li key={i} className="text-xs text-muted-foreground flex items-start gap-2">
                      <span className="text-green-400 shrink-0">•</span>{b.trim()}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Capture lead */}
            <div className="mt-5 pt-5 border-t border-border">
              <div className="text-sm font-semibold mb-3">Capture This Lead</div>
              {step!=="done"?(
                <div className="flex gap-3 flex-wrap">
                  <input className="flex-1 min-w-[140px] px-3 py-2 rounded-xl border border-border bg-background text-sm outline-none focus:border-primary"
                    placeholder="Name (optional)" value={name} onChange={e=>setName(e.target.value)}/>
                  <input className="flex-1 min-w-[180px] px-3 py-2 rounded-xl border border-border bg-background text-sm outline-none focus:border-primary"
                    placeholder="Email" type="email" value={email} onChange={e=>setEmail(e.target.value)} onKeyDown={e=>e.key==="Enter"&&captureLead()}/>
                  <button onClick={captureLead} disabled={loading||!email.trim()}
                    className="px-5 py-2 rounded-xl bg-green-500 text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50">
                    {loading?"Saving…":"💾 Save Lead"}
                  </button>
                </div>
              ):(
                <div className="text-sm text-green-400 font-medium">✓ Lead captured — {email}</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
