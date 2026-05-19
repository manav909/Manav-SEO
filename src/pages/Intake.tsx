import { useState, useRef } from "react";
import PortalNav from "@/components/PortalNav";

const post = (a: string, b: any = {}) =>
  fetch("/api/task-engine", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: a, ...b }),
  }).then(r => r.json()).catch(() => ({}));

const SEV_COLOR: any = {
  critical: "#ef4444", high: "#f97316", medium: "#f59e0b", low: "#10b981"
};

export default function Intake() {
  const [url,      setUrl]      = useState("");
  const [email,    setEmail]    = useState("");
  const [name,     setName]     = useState("");
  const [audit,    setAudit]    = useState<any>(null);
  const [pack,     setPack]     = useState<any>(null);
  const [step,     setStep]     = useState<"url"|"audit"|"pack"|"done">("url");
  const [loading,  setLoading]  = useState(false);
  const [packLoad, setPackLoad] = useState(false);
  const [progress, setProgress] = useState<{pct:number;msg:string}|null>(null);
  const [error,    setError]    = useState("");
  const auditRef = useRef<HTMLDivElement>(null);
  const packRef  = useRef<HTMLDivElement>(null);

  const runAudit = async () => {
    if (!url.trim()) return;
    setLoading(true); setError(""); setAudit(null); setPack(null);
    // Animated progress steps
    const auditSteps = [
      { pct: 8,  msg: "Fetching " + url.trim().replace(/^https?:\/\//,"").split("/")[0] + "…" },
      { pct: 22, msg: "Reading page structure and content…" },
      { pct: 38, msg: "Checking title tags, meta descriptions, H1s…" },
      { pct: 52, msg: "Analysing technical SEO signals…" },
      { pct: 65, msg: "Checking structured data and schema…" },
      { pct: 76, msg: "Cross-referencing algorithm updates…" },
      { pct: 86, msg: "Scoring against 47 ranking factors…" },
      { pct: 94, msg: "Compiling recommendations…" },
    ];
    let stepIdx = 0;
    setProgress(auditSteps[0]);
    const ticker = setInterval(() => {
      stepIdx = Math.min(stepIdx + 1, auditSteps.length - 1);
      setProgress(auditSteps[stepIdx]);
    }, 1800);
    const r = await post("instant_audit_showcase", { url: url.trim() });
    clearInterval(ticker);
    setProgress({ pct: 100, msg: "Audit complete ✓" });
    await new Promise(res => setTimeout(res, 600));
    setProgress(null);
    if (r.error) { setError(r.error); setLoading(false); return; }
    setAudit(r);
    setLoading(false);
    setStep("audit");
    setTimeout(() => auditRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  };

  const generatePack = async () => {
    setPackLoad(true); setPack(null);
    const packSteps = [
      { pct: 10, msg: "Analysing audit findings…" },
      { pct: 25, msg: "Researching similar case studies…" },
      { pct: 42, msg: "Writing executive summary…" },
      { pct: 58, msg: "Crafting pitch script…" },
      { pct: 72, msg: "Building objection handlers…" },
      { pct: 84, msg: "Creating follow-up sequence…" },
      { pct: 93, msg: "Finalising sales pack…" },
    ];
    let si = 0;
    setProgress(packSteps[0]);
    const ticker = setInterval(() => {
      si = Math.min(si + 1, packSteps.length - 1);
      setProgress(packSteps[si]);
    }, 2000);
    const r = await post("generate_sales_pack", { auditResult: audit, url });
    clearInterval(ticker);
    setProgress({ pct: 100, msg: "Sales pack ready ✓" });
    await new Promise(res => setTimeout(res, 600));
    setProgress(null);
    if (r.success) {
      setPack(r.pack);
      setStep("pack");
      setTimeout(() => packRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    }
    setPackLoad(false);
  };

  const captureLead = async () => {
    if (!email.trim()) { setError("Email required"); return; }
    setLoading(true);
    await post("capture_lead", { url, email: email.trim(), name: name.trim(), source: "intake", auditResult: audit });
    setLoading(false);
    setStep("done");
  };

  const downloadAsPDF = (content: string, filename: string) => {
    // Open in new window and trigger print dialog (Save as PDF)
    const win = window.open("", "_blank");
    if (!win) { alert("Allow popups to download PDF"); return; }
    win.document.write(content);
    win.document.close();
    win.focus();
    setTimeout(() => {
      win.print();
      // Close after print dialog
      win.onafterprint = () => win.close();
    }, 500);
  };

  const downloadAsDoc = (content: string, filename: string) => {
    const blob = new Blob([content], { type: "application/msword" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename.replace(".html", ".doc");
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const auditHTML = () => {
    if (!audit) return "";
    const cats = (audit.categories || []).map((c: any) => `
      <div style="margin-bottom:20px;padding:16px;border:1px solid #e2e8f0;border-radius:8px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
          <strong style="font-size:15px;">${c.name}</strong>
          <span style="font-size:20px;font-weight:bold;color:${c.score>=70?"#ef4444":c.score>=50?"#f59e0b":"#10b981"}">${c.score}/100</span>
        </div>
        ${(c.issues||[]).map((i: any) => `
          <div style="margin-bottom:8px;padding:10px;background:#f8fafc;border-radius:6px;border-left:3px solid ${SEV_COLOR[i.severity]||"#6366f1"}">
            <div style="font-weight:600;font-size:13px;color:#1e293b;">${i.issue}</div>
            <div style="font-size:12px;color:#64748b;margin-top:4px;">Fix: ${i.fix}</div>
            ${i.algorithmNote ? `<div style="font-size:11px;color:#6366f1;margin-top:3px;">⚡ ${i.algorithmNote}</div>` : ""}
          </div>`).join("")}
      </div>`).join("");
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>SEO Audit — ${url}</title>
      <style>body{font-family:system-ui,sans-serif;max-width:800px;margin:40px auto;padding:0 20px;color:#1e293b;}@media print{body{max-width:100%;margin:0;padding:20px;-webkit-print-color-adjust:exact;print-color-adjust:exact;}@page{size:A4;margin:1.5cm;}}@media print{body{max-width:100%;margin:0;padding:20px;-webkit-print-color-adjust:exact;print-color-adjust:exact;}@page{size:A4;margin:1.5cm;}}
      h1{color:#1B4080;}h2{color:#1B4080;margin-top:32px;}</style></head><body>
      <h1>SEO Audit Report</h1><p><strong>URL:</strong> ${url}</p>
      <p><strong>Date:</strong> ${new Date().toLocaleDateString("en-GB",{day:"numeric",month:"long",year:"numeric"})}</p>
      <h2 style="font-size:32px;color:${(audit.score||0)>=70?"#ef4444":(audit.score||0)>=50?"#f59e0b":"#10b981"}">Score: ${audit.score||0}/100</h2>
      <h2>Quick Wins</h2><ul>${(audit.quickWins||[]).map((w:string)=>`<li>${w}</li>`).join("")}</ul>
      <h2>Full Findings</h2>${cats}
      <h2>Algorithm Notes</h2><ul>${(audit.algorithmHighlights||[]).map((a:string)=>`<li>${a}</li>`).join("")}</ul>
      <p style="margin-top:40px;font-size:12px;color:#94a3b8;">Generated by SEO Season · seoseason.com</p>
      </body></html>`;
  };

  const packHTML = () => {
    if (!pack) return "";
    // quickWinPlan uses | separator — convert to bullets
    const qwp = (pack.quickWinPlan||"").split("|").map((s:string)=>s.trim()).filter(Boolean);
    const proposal = (pack.proposalPoints||[]).map((p: any) =>
      `<div style="margin-bottom:16px;padding:14px;background:#f8fafc;border-radius:8px;border-left:3px solid #6366f1;">
        <strong>${p.heading}</strong><p style="margin:6px 0 0;color:#475569;font-size:14px;">${p.body}</p></div>`).join("");
    const objections = (pack.objectionHandlers||[]).map((o: any) =>
      `<div style="margin-bottom:14px;"><strong style="color:#ef4444;">Objection: ${o.objection}</strong>
        <p style="color:#475569;font-size:14px;margin:4px 0 0;">${o.response}</p></div>`).join("");
    const followup = (pack.followUpSequence||[]).map((f: any) =>
      `<div style="margin-bottom:12px;padding:12px;background:#f1f5f9;border-radius:6px;">
        <strong>Day ${f.day}</strong><p style="margin:4px 0 0;font-size:14px;color:#475569;">${f.message}</p></div>`).join("");
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Sales Pack — ${url}</title>
      <style>body{font-family:system-ui,sans-serif;max-width:800px;margin:40px auto;padding:0 20px;color:#1e293b;}
      h1,h2{color:#1B4080;}pre{white-space:pre-wrap;font-family:inherit;}</style></head><body>
      <h1>Sales Pack: ${url}</h1>
      <p style="font-size:13px;color:#64748b;">Generated ${new Date().toLocaleDateString("en-GB",{day:"numeric",month:"long",year:"numeric"})}</p>
      <h2>Executive Summary</h2><p>${pack.executiveSummary||""}</p>
      <h2>Case Study</h2>
      ${pack.caseStudy?`<div style="padding:16px;background:#f0fdf4;border-radius:8px;border-left:3px solid #10b981;">
        <strong>${pack.caseStudy.title}</strong>
        <p><strong>Situation:</strong> ${pack.caseStudy.situation}</p>
        <p><strong>Approach:</strong> ${pack.caseStudy.approach}</p>
        <p><strong>Result:</strong> ${pack.caseStudy.result}</p>
        <p style="color:#059669;"><em>${pack.caseStudy.relevance}</em></p></div>`:""}
      <h2>Proposal Points</h2>${proposal}
      <h2>Pitch Script</h2>
      <div style="padding:16px;background:#faf5ff;border-radius:8px;border-left:3px solid #6366f1;white-space:pre-wrap;font-size:14px;">${pack.pitchScript||""}</div>
      <h2>Objection Handlers</h2>${objections}
      <h2>Follow-up Sequence</h2>${followup}
      <h2>Quick Win Plan (First 7 Days)</h2><ul>${qwp.map(b=>"<li>"+b+"</li>").join("")||"<li>"+pack.quickWinPlan+"</li>"}</ul>
      <p style="margin-top:40px;font-size:12px;color:#94a3b8;">SEO Season · seoseason.com</p>
      </body></html>`;
  };

  // Progress bar render
  const ProgressBar = () => !progress ? null : (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="w-full max-w-md mx-6 rounded-2xl border border-border bg-card p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-semibold">{progress.msg}</span>
          <span className="text-sm font-bold text-primary">{progress.pct}%</span>
        </div>
        {/* Track */}
        <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700 ease-out"
            style={{
              width: progress.pct + "%",
              background: progress.pct === 100
                ? "hsl(var(--primary))"
                : "linear-gradient(90deg, hsl(var(--primary)), hsl(var(--primary)/0.7))",
            }}
          />
        </div>
        {/* Animated dots */}
        {progress.pct < 100 && (
          <div className="flex gap-1.5 mt-4 justify-center">
            {[0,1,2].map(i => (
              <div key={i} className="w-1.5 h-1.5 rounded-full bg-primary/60"
                style={{ animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite` }} />
            ))}
          </div>
        )}
      </div>
    </div>
  );

  const S = {
    card: "rounded-2xl border border-border bg-card p-5",
    btn: (col: string) => `px-4 py-2 rounded-xl text-xs font-semibold transition-opacity hover:opacity-80 disabled:opacity-40`,
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <ProgressBar />
      <PortalNav />
      <div className="max-w-4xl mx-auto px-6 py-8">

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold mb-1">Lead Intake</h1>
          <p className="text-sm text-muted-foreground">Run a full SEO audit, generate a sales pack, and capture the lead.</p>
        </div>

        {/* URL input */}
        <div className={`${S.card} mb-6`}>
          <div className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wider">Website URL</div>
          <div className="flex gap-3">
            <input
              className="flex-1 px-4 py-2.5 rounded-xl border border-border bg-background text-sm outline-none focus:border-primary"
              placeholder="yourprospect.com"
              value={url}
              onChange={e => setUrl(e.target.value)}
              onKeyDown={e => e.key === "Enter" && runAudit()}
            />
            <button onClick={runAudit} disabled={loading || !url.trim()}
              className="px-6 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-50">
              {loading ? "Auditing…" : "Run Audit"}
            </button>
          </div>
          {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
        </div>

        {/* Audit results */}
        {audit && (
          <div ref={auditRef} className={`${S.card} mb-6`}>
            <div className="flex items-center justify-between mb-5">
              <div>
                <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">SEO Audit</div>
                <div className="text-base font-semibold">{url}</div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-center">
                  <div className={`text-3xl font-black ${(audit.score||0) >= 70 ? "text-red-400" : (audit.score||0) >= 50 ? "text-yellow-400" : "text-green-400"}`}>
                    {audit.score||0}
                  </div>
                  <div className="text-xs text-muted-foreground">/100</div>
                </div>
                <button onClick={() => downloadAsPDF(auditHTML(), `audit-${url.replace(/[^a-z0-9]/gi,"_")}.pdf`)}
                  className="px-3 py-1.5 rounded-lg border border-border text-xs font-medium hover:border-primary/40">
                  ⬇ Download Audit
                </button>
              </div>
            </div>

            {/* Quick wins */}
            {(audit.quickWins||[]).length > 0 && (
              <div className="mb-5">
                <div className="text-xs font-bold text-green-400 uppercase tracking-wider mb-2">⚡ Quick Wins</div>
                <div className="space-y-1.5">
                  {audit.quickWins.map((w: string, i: number) => (
                    <div key={i} className="text-xs text-muted-foreground flex items-start gap-2">
                      <span className="text-green-400 shrink-0">✓</span>{w}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Categories */}
            <div className="space-y-4">
              {(audit.categories||[]).map((cat: any, ci: number) => (
                <div key={ci} className="border border-border rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-semibold">{cat.name}</span>
                    <span className={`text-sm font-bold ${cat.score >= 70 ? "text-red-400" : cat.score >= 50 ? "text-yellow-400" : "text-green-400"}`}>
                      {cat.score}/100
                    </span>
                  </div>
                  <div className="space-y-2">
                    {(cat.issues||[]).map((issue: any, ii: number) => (
                      <div key={ii} className="text-xs p-3 rounded-lg"
                        style={{ background: `${SEV_COLOR[issue.severity] || "#6366f1"}10`, borderLeft: `2px solid ${SEV_COLOR[issue.severity] || "#6366f1"}` }}>
                        <div className="font-semibold mb-1" style={{ color: SEV_COLOR[issue.severity] || "#6366f1" }}>
                          [{issue.severity}] {issue.issue}
                        </div>
                        <div className="text-muted-foreground">Fix: {issue.fix}</div>
                        {issue.algorithmNote && <div className="mt-1 text-primary">⚡ {issue.algorithmNote}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Algorithm highlights */}
            {(audit.algorithmHighlights||[]).length > 0 && (
              <div className="mt-4 p-4 rounded-xl border border-primary/20 bg-primary/5">
                <div className="text-xs font-bold text-primary uppercase tracking-wider mb-2">Algorithm Context</div>
                <div className="space-y-1">
                  {audit.algorithmHighlights.map((a: string, i: number) => (
                    <div key={i} className="text-xs text-muted-foreground flex items-start gap-2">
                      <span className="text-primary shrink-0">◆</span>{a}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Generate sales pack CTA */}
            <div className="mt-5 pt-5 border-t border-border flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold">Generate Sales Pack</div>
                <div className="text-xs text-muted-foreground mt-0.5">Case study, pitch script, objection handlers, follow-up sequence</div>
              </div>
              <button onClick={generatePack} disabled={packLoad}
                className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-50">
                {packLoad ? "Generating…" : "✨ Generate Sales Pack"}
              </button>
            </div>
          </div>
        )}

        {/* Sales Pack */}
        {pack && (
          <div ref={packRef} className={`${S.card} mb-6`}>
            <div className="flex items-center justify-between mb-5">
              <div>
                <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Sales Pack</div>
                <div className="text-base font-semibold">{url}</div>
              </div>
              <button onClick={() => downloadAsPDF(packHTML(), `sales-pack-${url.replace(/[^a-z0-9]/gi,"_")}.pdf`)}
                className="px-3 py-1.5 rounded-lg border border-border text-xs font-medium hover:border-primary/40">
                ⬇ Download Pack
              </button>
            </div>

            {/* Executive summary */}
            <div className="mb-5 p-4 rounded-xl bg-primary/5 border border-primary/20">
              <div className="text-xs font-bold text-primary uppercase tracking-wider mb-2">Executive Summary</div>
              <p className="text-sm text-muted-foreground leading-relaxed">{pack.executiveSummary}</p>
            </div>

            {/* Case study */}
            {pack.caseStudy && (
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

            {/* Pitch script */}
            {pack.pitchScript && (
              <div className="mb-5">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Pitch Script</div>
                  <button onClick={() => navigator.clipboard.writeText(pack.pitchScript).catch(()=>{})}
                    className="text-xs text-primary hover:underline">Copy</button>
                </div>
                <div className="p-4 rounded-xl bg-violet-500/5 border border-violet-500/20 text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                  {pack.pitchScript}
                </div>
              </div>
            )}

            {/* Proposal points */}
            {(pack.proposalPoints||[]).length > 0 && (
              <div className="mb-5">
                <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Proposal Points</div>
                <div className="space-y-3">
                  {pack.proposalPoints.map((p: any, i: number) => (
                    <div key={i} className="p-3 rounded-xl border border-border">
                      <div className="text-xs font-semibold mb-1">{p.heading}</div>
                      <div className="text-xs text-muted-foreground">{p.body}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Objection handlers */}
            {(pack.objectionHandlers||[]).length > 0 && (
              <div className="mb-5">
                <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Objection Handlers</div>
                <div className="space-y-3">
                  {pack.objectionHandlers.map((o: any, i: number) => (
                    <div key={i} className="p-3 rounded-xl border border-red-500/20 bg-red-500/5">
                      <div className="text-xs font-semibold text-red-400 mb-1">"{o.objection}"</div>
                      <div className="text-xs text-muted-foreground">{o.response}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Follow-up sequence */}
            {(pack.followUpSequence||[]).length > 0 && (
              <div className="mb-5">
                <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Follow-up Sequence</div>
                <div className="space-y-3">
                  {pack.followUpSequence.map((f: any, i: number) => (
                    <div key={i} className="flex gap-3 items-start">
                      <div className="shrink-0 w-12 h-6 rounded-lg bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">
                        Day {f.day}
                      </div>
                      <div className="flex-1 p-3 rounded-xl border border-border text-xs text-muted-foreground">
                        {f.message}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Quick win plan */}
            {pack.quickWinPlan && (
              <div className="p-4 rounded-xl bg-green-500/5 border border-green-500/20">
                <div className="text-xs font-bold text-green-400 uppercase tracking-wider mb-2">First 7 Days Plan</div>
                <ul className="space-y-1">{(pack.quickWinPlan||"").split("|").map((b:string,i:number)=>b.trim()&&<li key={i} className="text-xs text-muted-foreground flex items-start gap-1"><span className="text-green-400 shrink-0">•</span>{b.trim()}</li>)}</ul>
              </div>
            )}

            {/* Capture lead */}
            <div className="mt-5 pt-5 border-t border-border">
              <div className="text-sm font-semibold mb-3">Capture This Lead</div>
              {step !== "done" ? (
                <div className="flex gap-3">
                  <input className="flex-1 px-3 py-2 rounded-xl border border-border bg-background text-sm outline-none focus:border-primary"
                    placeholder="Name (optional)" value={name} onChange={e => setName(e.target.value)} />
                  <input className="flex-1 px-3 py-2 rounded-xl border border-border bg-background text-sm outline-none focus:border-primary"
                    placeholder="Email" type="email" value={email} onChange={e => setEmail(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && captureLead()} />
                  <button onClick={captureLead} disabled={loading || !email.trim()}
                    className="px-5 py-2 rounded-xl bg-green-500 text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50">
                    {loading ? "Saving…" : "💾 Save Lead"}
                  </button>
                </div>
              ) : (
                <div className="text-sm text-green-400 font-medium">✓ Lead captured — {email}</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
