import { useState, useEffect } from "react";
import PortalNav from "@/components/PortalNav";
import { useProject } from "@/contexts/ProjectContext";
import { useAuth } from "@/contexts/AuthContext";

/* QA Desk.
   The checkpoint between finished work and the client. Everything a round needs
   lives on this one page: the client record read from the chat and calls, the
   project and Search Console setup for the site being checked, the workbook, the
   run itself, and the verdict that holds the client summary back until the
   delivery is genuinely clean. All platform calls go through /api/task-engine. */

const post = (a: string, b: any = {}) =>
  fetch("/api/task-engine", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: a, ...b }),
  }).then(async (r) => {
    const raw = await r.text();
    try { return JSON.parse(raw); }
    catch { return { success: false, error: r.ok ? "The server returned an unreadable response." : `Request failed (${r.status}).` }; }
  }).catch((e) => ({ success: false, error: String(e?.message || e) }));

const SLOT = 25;
const dom = (u: string) => { try { const s = String(u || "").trim(); return s ? new URL(s.startsWith("http") ? s : "https://" + s).hostname.replace(/^www\./, "").toLowerCase() : ""; } catch { return ""; } };

const PILL: Record<string, string> = {
  verified: "text-emerald-400 border-emerald-500/40 bg-emerald-500/10",
  partial: "text-amber-400 border-amber-500/40 bg-amber-500/10",
  failed: "text-red-400 border-red-500/40 bg-red-500/10",
  unverifiable: "text-muted-foreground border-border bg-muted/30",
  passed: "text-emerald-400 border-emerald-500/40 bg-emerald-500/10",
  awaiting_fix: "text-amber-400 border-amber-500/40 bg-amber-500/10",
  rechecking: "text-sky-400 border-sky-500/40 bg-sky-500/10",
  checking: "text-sky-400 border-sky-500/40 bg-sky-500/10",
  queued: "text-muted-foreground border-border bg-muted/30",
};

type Sheet = { name: string; headers: string[]; rows: any[] };

function Step({ n, title, hint, done, children }: any) {
  return (
    <section className="rounded-2xl border border-border bg-card/40 overflow-hidden">
      <header className="flex items-center gap-3 px-5 py-3 border-b border-border/70">
        <span className={`w-6 h-6 shrink-0 rounded-full grid place-items-center text-[11px] font-bold border ${done ? "border-emerald-500/50 text-emerald-400 bg-emerald-500/10" : "border-border text-muted-foreground"}`}>
          {done ? "\u2713" : n}
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold leading-tight">{title}</h2>
          {hint ? <p className="text-[11px] text-muted-foreground leading-tight">{hint}</p> : null}
        </div>
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}

export default function QaDesk() {
  const proj: any = useProject();
  const auth: any = useAuth();
  const navProjectId = proj?.selectedProjectId || localStorage.getItem("seo_season_proj") || "";
  const navProjectName = proj?.selectedProject?.name || "";
  const navProjectUrl = proj?.selectedProject?.url || "";

  const [execName, setExecName] = useState("");
  const [clientName, setClientName] = useState("");
  const [siteUrl, setSiteUrl] = useState("");
  const [clientContext, setClientContext] = useState("");
  const [mailText, setMailText] = useState("");
  const [extracted, setExtracted] = useState<any>(null);

  const [projectId, setProjectId] = useState(navProjectId);
  const [projectLabel, setProjectLabel] = useState(navProjectName);
  const [gsc, setGsc] = useState<any>(null);
  const [setupBusy, setSetupBusy] = useState("");

  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [fileName, setFileName] = useState("");
  const [reviewId, setReviewId] = useState("");
  const [agenda, setAgenda] = useState<any[]>([]);
  const [progress, setProgress] = useState<Record<number, { checked: number; total: number; done: boolean; remark: string }>>({});
  const [findings, setFindings] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [worklist, setWorklist] = useState<any>(null);
  const [profiles, setProfiles] = useState<any[]>([]);

  const siteDomain = dom(siteUrl);
  const projDomain = dom(navProjectUrl);
  const usingNavProject = projectId === navProjectId;
  const mismatch = Boolean(siteDomain && projDomain && siteDomain !== projDomain && usingNavProject);

  useEffect(() => {
    if (navProjectUrl && !siteUrl.trim()) setSiteUrl(navProjectUrl.startsWith("http") ? navProjectUrl : `https://${navProjectUrl}/`);
    loadWorklist();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navProjectUrl]);

  useEffect(() => { if (projectId) refreshGsc(projectId); }, [projectId]);

  const loadWorklist = async () => { const r: any = await post("wizard_qa_worklist", {}); if (r?.success) setWorklist(r); };
  const loadProfiles = async () => { const r: any = await post("wizard_qa_profile", { executiveName: "" }); if (r?.success) setProfiles(r.executives || []); };

  const refreshGsc = async (pid: string) => {
    const r: any = await post("gsc_status", { projectId: pid });
    setGsc(r?.success === false ? null : r);
  };

  /* Setup happens here so nobody has to leave the page. */
  const createProjectForSite = async () => {
    if (!siteDomain) { setError("Enter the client site first."); return; }
    setError(""); setSetupBusy("Creating the project...");
    const r: any = await post("wizard_create_project", {
      name: clientName.trim() || siteDomain,
      domain: siteUrl.trim(),
      userId: auth?.user?.id || "",
    });
    setSetupBusy("");
    if (!r?.success || !r?.projectId) { setError(r?.error || "Could not create the project."); return; }
    setProjectId(r.projectId);
    setProjectLabel(clientName.trim() || siteDomain);
    refreshGsc(r.projectId);
  };

  const connectGsc = async () => {
    if (!projectId) { setError("Select or create the project for this site first."); return; }
    setError(""); setSetupBusy("Opening Google...");
    const r: any = await post("gsc_oauth_start", { projectId });
    setSetupBusy("");
    if (!r?.url) { setError(r?.error || "Could not start the Search Console connection."); return; }
    window.open(r.url, "gsc_oauth", "width=520,height=640");
    const onMsg = (e: MessageEvent) => {
      if ((e.data || {}).type !== "gsc_connected") return;
      window.removeEventListener("message", onMsg);
      refreshGsc(projectId);
    };
    window.addEventListener("message", onMsg);
  };

  const readContext = async () => {
    if (!clientContext.trim() && !mailText.trim()) { setError("Paste the client chat, call notes or the mail first."); return; }
    setError(""); setBusy("Reading the chat and calls...");
    const r: any = await post("wizard_qa_extract_context", { chatText: clientContext, mailText });
    setBusy("");
    if (!r?.success) { setError(r?.error || "Could not read the context."); return; }
    if (r.client_name && !clientName.trim()) setClientName(r.client_name);
    if (r.site_url && !siteUrl.trim()) setSiteUrl(r.site_url.startsWith("http") ? r.site_url : `https://${r.site_url}/`);
    if (r.executive_name && !execName.trim()) setExecName(r.executive_name);
    setExtracted(r);
  };

  const onWorkbook = async (fileList: FileList | null) => {
    const f = (fileList || [])[0];
    if (!f) return;
    setBusy("Reading every tab...");
    try {
      const XLSX: any = await import(/* @vite-ignore */ "https://esm.sh/xlsx@0.18.5");
      const wb = XLSX.read(new Uint8Array(await f.arrayBuffer()), { type: "array" });
      const out: Sheet[] = [];
      for (const name of (wb.SheetNames || [])) {
        try {
          const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: "" });
          out.push({ name, headers: rows.length ? Object.keys(rows[0]) : [], rows });
        } catch { /* skip an unreadable tab */ }
      }
      setSheets(out); setFileName(f.name); setBusy("");
    } catch (e: any) { setBusy(""); setError(`Could not read the workbook. ${e?.message || ""}`); }
  };

  const startReview = async () => {
    setError(""); setFindings([]); setSummary(null); setProgress({});
    if (!siteUrl.trim()) { setError("Enter the client site."); return; }
    if (!sheets.length) { setError("Upload the delivery workbook."); return; }
    setRunning(true); setBusy("Setting the agenda for this account...");
    const created: any = await post("wizard_qa_create", {
      projectId, siteUrl: siteUrl.trim(), clientName, executiveName: execName, clientContext, mailText,
      tabs: sheets.map((s) => ({ name: s.name, headers: s.headers, rowCount: s.rows.length })),
    });
    if (!created?.success) { setRunning(false); setBusy(""); setError(created?.error || "Could not start the review."); return; }
    setReviewId(created.review.id); setAgenda(created.agenda || []);
    await runAllTabs(created.review.id);
  };

  const runAllTabs = async (rid: string) => {
    const collected: any[] = [];
    for (let ti = 0; ti < sheets.length; ti++) {
      const sheet = sheets[ti];
      if (!sheet.rows.length) { setProgress((p) => ({ ...p, [ti]: { checked: 0, total: 0, done: true, remark: "Empty tab." } })); continue; }
      let offset = 0;
      while (true) {
        setBusy(`${sheet.name}: rows ${offset + 1} to ${Math.min(offset + SLOT, sheet.rows.length)} of ${sheet.rows.length}`);
        const r: any = await post("wizard_qa_check_tab", {
          reviewId: rid, tabIndex: ti, rowOffset: offset,
          rows: sheet.rows.slice(offset, offset + SLOT), totalRows: sheet.rows.length,
        });
        if (!r?.success) { setError(`${sheet.name}: ${r?.error || "check failed"}`); break; }
        for (const f of (r.findings || [])) collected.push({ ...f, tab_name: sheet.name, tab_index: ti });
        setFindings([...collected]);
        setProgress((p) => ({ ...p, [ti]: { checked: r.rows_checked, total: r.row_count, done: r.done, remark: r.tab_remark || "" } }));
        if (r.done || r.next_offset == null) break;
        offset = r.next_offset;
      }
    }
    setBusy("Reconciling against the commitments...");
    const fin: any = await post("wizard_qa_finalize", { reviewId: rid });
    setSummary(fin?.success ? fin : null);
    setRunning(false); setBusy(""); loadWorklist();
  };

  const openRecheck = async () => {
    if (!reviewId) return;
    const r: any = await post("wizard_qa_recheck", { reviewId });
    if (!r?.success) { setError(r?.error || "Could not open a recheck round."); return; }
    setSummary(null); setFindings([]); setProgress({}); setError("");
    setBusy(`Round ${r.round} open. Upload the corrected workbook and run again.`);
    loadWorklist();
  };

  const openDoc = (title: string, md: string) => {
    const esc = (x: string) => String(x || "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] || c));
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>body{font:15px/1.65 -apple-system,system-ui,Segoe UI,sans-serif;color:#1a1a2e;max-width:900px;margin:40px auto;padding:0 22px;white-space:pre-wrap}</style></head><body>${esc(md)}<p style="color:#6b6b80;margin-top:26px">Prepared by Manav S.</p></body></html>`;
    const tab = window.open("", "_blank");
    if (tab) { tab.document.write(html); tab.document.close(); }
  };

  const downloadAnnotated = async () => {
    if (!sheets.length) return;
    setBusy("Building the reviewed workbook...");
    try {
      const XLSX: any = await import(/* @vite-ignore */ "https://esm.sh/xlsx@0.18.5");
      const wb = XLSX.utils.book_new();
      for (let ti = 0; ti < sheets.length; ti++) {
        const byRow = new Map<number, any>();
        for (const f of findings) if (f.tab_index === ti) byRow.set(f.row_index, f);
        const rows = sheets[ti].rows.map((r, i) => {
          const f = byRow.get(i);
          return { ...r, "QA status": f ? f.status : "not checked", "QA severity": f?.severity || "",
            "QA mistake type": f?.mistake_category || "", "QA observed live": f?.observed || "", "QA remark": f?.remark || "" };
        });
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), sheets[ti].name.slice(0, 31));
      }
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sheets.map((s, i) => ({ Tab: s.name, "Rows checked": progress[i]?.checked ?? 0, "Reviewer remark": progress[i]?.remark || "" }))), "QA remarks");
      if (agenda.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(agenda.map((a: any) => ({ Focus: a.focus, Why: a.why, Weight: a.weight }))), "QA agenda");
      XLSX.writeFile(wb, `QA reviewed ${fileName || "workbook"}`.replace(/\.xlsx?$/i, "") + ".xlsx");
      setBusy("");
    } catch (e: any) { setBusy(""); setError(`Could not build the workbook. ${e?.message || ""}`); }
  };

  const openReview = async (id: string) => {
    const r: any = await post("wizard_qa_load", { reviewId: id });
    if (!r?.success) { setError(r?.error || "Could not load."); return; }
    setReviewId(id); setAgenda(r.review.agenda || []); setSiteUrl(r.review.site_url || "");
    setClientName(r.review.client_name || ""); setExecName(r.review.executive_name || "");
    setFindings((r.findings || []).map((f: any) => ({ ...f, tab_index: -1 })));
    setSummary({ totals: r.review.totals || {}, status: r.review.status, round: r.review.round,
      verdict: `Saved review, round ${r.review.round}, status ${r.review.status}.`, documents: null });
  };

  const t = summary?.totals || {};
  const totalRows = sheets.reduce((a, s) => a + s.rows.length, 0);
  const checkedRows = Object.values(progress).reduce((a: number, p: any) => a + (p?.checked || 0), 0);
  const gscOn = Boolean(gsc?.lastPullAt) && !mismatch;
  const step1done = Boolean(siteUrl.trim() && (clientContext.trim() || mailText.trim()));
  const step2done = Boolean(projectId) && !mismatch;
  const step3done = sheets.length > 0;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <PortalNav />
      <div className="max-w-6xl mx-auto px-4 py-8">

        <div className="flex flex-wrap items-end justify-between gap-3 mb-1">
          <h1 className="text-2xl font-bold tracking-tight">QA Desk</h1>
          {summary ? (
            <span className={`text-xs px-3 py-1 rounded-full border font-semibold ${summary.ready_to_submit ? PILL.passed : PILL.awaiting_fix}`}>
              {summary.ready_to_submit ? "Cleared to send" : "Held: not ready to send"}
            </span>
          ) : (
            <span className="text-xs px-3 py-1 rounded-full border border-border text-muted-foreground">Nothing checked yet</span>
          )}
        </div>
        <p className="text-sm text-muted-foreground mb-6">The checkpoint between finished work and the client. Nothing reaches them until every claim is confirmed on the live site.</p>

        <div className="grid lg:grid-cols-[1fr_320px] gap-5 items-start">
          <div className="space-y-4">

            <Step n={1} title="The client and the promise" hint="Paste the conversation and the mail, then let it fill the record." done={step1done}>
              <div className="grid md:grid-cols-2 gap-3 mb-3">
                <textarea className="w-full h-28 bg-muted/40 border border-border rounded-xl px-3 py-2 text-sm" placeholder="Client chat and call notes. This sets the QA agenda." value={clientContext} onChange={(e) => setClientContext(e.target.value)} />
                <textarea className="w-full h-28 bg-muted/40 border border-border rounded-xl px-3 py-2 text-sm" placeholder="Commitment mail sent to the project manager." value={mailText} onChange={(e) => setMailText(e.target.value)} />
              </div>
              <button onClick={readContext} className="text-xs px-3 py-1.5 rounded-lg bg-primary/10 text-primary border border-primary/30 mb-3">Fill from chat and calls</button>
              <div className="grid md:grid-cols-3 gap-3">
                <input className="bg-muted/40 border border-border rounded-xl px-3 py-2 text-sm" placeholder="Executive who did the work" value={execName} onChange={(e) => setExecName(e.target.value)} />
                <input className="bg-muted/40 border border-border rounded-xl px-3 py-2 text-sm" placeholder="Client name" value={clientName} onChange={(e) => setClientName(e.target.value)} />
                <input className="bg-muted/40 border border-border rounded-xl px-3 py-2 text-sm" placeholder="https://client.com/" value={siteUrl} onChange={(e) => setSiteUrl(e.target.value)} />
              </div>
              {extracted ? (
                <div className="mt-3 rounded-xl border border-border bg-muted/20 p-3">
                  {extracted.persona ? <p className="text-xs text-foreground/90">{extracted.persona}</p> : null}
                  {(extracted.priorities || []).length ? <p className="text-[11px] mt-1"><span className="text-muted-foreground">Priorities: </span>{extracted.priorities.join("; ")}</p> : null}
                  {(extracted.pain_points || []).length ? <p className="text-[11px] mt-0.5"><span className="text-muted-foreground">Pain points: </span>{extracted.pain_points.join("; ")}</p> : null}
                </div>
              ) : null}
            </Step>

            <Step n={2} title="Setup for this site" hint="The project and Search Console this round will use. Set it up here." done={step2done}>
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/20 px-3 py-2.5">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold">Project</div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      {mismatch
                        ? `The nav project is ${navProjectName || projDomain} (${projDomain}), a different site from ${siteDomain}.`
                        : projectId ? `${projectLabel || navProjectName || projDomain || "selected"} covers ${siteDomain || "this site"}.` : "No project selected."}
                    </div>
                  </div>
                  {mismatch || !projectId ? (
                    <button onClick={createProjectForSite} className="text-xs px-3 py-1.5 rounded-lg bg-primary/10 text-primary border border-primary/30 whitespace-nowrap">Create project for {siteDomain || "this site"}</button>
                  ) : <span className={`text-[11px] px-2 py-0.5 rounded-full border ${PILL.verified}`}>matched</span>}
                </div>

                <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/20 px-3 py-2.5">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold">Search Console</div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      {mismatch
                        ? "Left out while the project does not match, because that data belongs to another client."
                        : gscOn ? `Connected${gsc?.resourceId ? ` to ${gsc.resourceId}` : ""}, last pulled ${gsc?.lastPullAt ? new Date(gsc.lastPullAt).toLocaleDateString() : "recently"}.`
                        : "Not connected. Optional: the live page checks do not need it."}
                    </div>
                  </div>
                  {!gscOn ? (
                    <button onClick={connectGsc} disabled={!projectId} className="text-xs px-3 py-1.5 rounded-lg border border-border whitespace-nowrap disabled:opacity-50">Connect</button>
                  ) : <span className={`text-[11px] px-2 py-0.5 rounded-full border ${PILL.verified}`}>connected</span>}
                </div>

                {mismatch ? (
                  <p className="text-[11px] text-amber-400">
                    Live page checks run against {siteDomain} either way and stay valid. Create the project above to bring Search Console into this round.
                  </p>
                ) : null}
                {setupBusy ? <p className="text-[11px] text-muted-foreground">{setupBusy}</p> : null}
              </div>
            </Step>

            <Step n={3} title="Delivery workbook" hint="Every tab is read, then checked in slots so nothing times out." done={step3done}>
              <input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => onWorkbook(e.target.files)}
                className="block w-full text-xs text-muted-foreground file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border file:border-border file:bg-muted/40 file:text-xs" />
              {sheets.length ? (
                <div className="mt-3 space-y-1.5">
                  <div className="text-[11px] text-muted-foreground">{sheets.length} tab(s), {totalRows} rows{checkedRows ? ` | ${checkedRows} checked` : ""}</div>
                  {sheets.map((s, i) => {
                    const p = progress[i]; const pct = p && p.total ? Math.round((p.checked / p.total) * 100) : 0;
                    return (
                      <div key={i} className="rounded-lg border border-border px-3 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-medium truncate">{s.name}</span>
                          <span className="text-[10px] text-muted-foreground whitespace-nowrap">{p ? `${p.checked}/${p.total}` : `${s.rows.length} rows`}</span>
                        </div>
                        <div className="h-1 rounded-full bg-muted mt-1.5 overflow-hidden">
                          <div className={`h-full ${p?.done ? "bg-emerald-500" : "bg-primary"}`} style={{ width: `${pct}%` }} />
                        </div>
                        {p?.remark ? <p className="text-[10px] text-muted-foreground mt-1">{p.remark}</p> : null}
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </Step>

            <div className="flex flex-wrap items-center gap-2">
              <button onClick={startReview} disabled={running} className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-60">
                {running ? "Checking..." : "Run the check"}
              </button>
              {reviewId ? <button onClick={downloadAnnotated} className="px-3 py-2 rounded-xl border border-border text-sm">Download reviewed workbook</button> : null}
              {summary && summary.status === "awaiting_fix" ? <button onClick={openRecheck} className="px-3 py-2 rounded-xl border border-sky-500/40 text-sky-400 text-sm">Open recheck round</button> : null}
              {busy ? <span className="text-xs text-muted-foreground">{busy}</span> : null}
            </div>
            {error ? <p className="text-sm text-red-400">{error}</p> : null}

            {summary ? (
              <div className={`rounded-2xl border p-5 ${summary.ready_to_submit ? "border-emerald-500/40 bg-emerald-500/10" : "border-amber-500/40 bg-amber-500/10"}`}>
                <div className="text-sm font-bold mb-1">Round {summary.round}</div>
                <p className="text-sm text-foreground/90">{summary.verdict}</p>
                <div className="flex flex-wrap gap-3 mt-2 text-xs">
                  <span className="text-emerald-400">{t.verified || 0} verified</span>
                  <span className="text-amber-400">{t.partial || 0} partial</span>
                  <span className="text-red-400">{t.failed || 0} failed</span>
                  <span className="text-muted-foreground">{t.unverifiable || 0} unverifiable</span>
                </div>
                {summary.documents ? (
                  <div className="flex flex-wrap gap-2 mt-3">
                    <button onClick={() => openDoc("QA report", summary.documents.internal_qa)} className="text-xs px-3 py-1.5 rounded-lg bg-primary/10 text-primary border border-primary/30">QA report</button>
                    <button onClick={() => openDoc("Fix list", summary.documents.fix_list)} className="text-xs px-3 py-1.5 rounded-lg bg-primary/10 text-primary border border-primary/30">Fix list</button>
                    <button onClick={() => openDoc("Client summary", summary.documents.client_summary)} className="text-xs px-3 py-1.5 rounded-lg bg-primary/10 text-primary border border-primary/30">Client summary</button>
                  </div>
                ) : null}
                {(summary.missing || []).length ? <p className="text-xs mt-3"><span className="text-muted-foreground">Promised but not reported: </span><span className="text-amber-400">{summary.missing.map((m: any) => m.title).join(", ")}</span></p> : null}
                {(summary.quantity || []).map((q: any, i: number) => (
                  <p key={i} className="text-xs mt-1"><span className="font-semibold">{q.title}</span>: committed {q.committed}, reported {q.reported}, live {q.verified}. <span className="text-muted-foreground">{q.note}</span></p>
                ))}
                {(summary.mistake_pattern || []).length ? (
                  <p className="text-xs mt-2"><span className="text-muted-foreground">Mistake pattern: </span>{summary.mistake_pattern.map((m: any) => `${m.category} (${m.count})`).join(", ")}</p>
                ) : null}
                {summary.gsc ? <p className="text-[11px] text-muted-foreground mt-2">{summary.gsc.note}</p> : null}
              </div>
            ) : null}

            {findings.length ? (
              <div className="rounded-2xl border border-border p-5">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Findings ({findings.length})</div>
                <div className="space-y-2 max-h-[520px] overflow-auto">
                  {findings.filter((f) => f.status !== "verified").concat(findings.filter((f) => f.status === "verified")).map((f, i) => (
                    <div key={i} className="rounded-xl border border-border p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="text-sm font-semibold">{f.item}</div>
                        <span className={`text-[11px] px-2 py-0.5 rounded-full border whitespace-nowrap ${PILL[f.status] || PILL.queued}`}>{f.status}{f.severity ? ` / ${f.severity}` : ""}</span>
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">{f.tab_name}{f.url ? ` | ${String(f.url).replace(/^https?:\/\//, "")}` : ""}</div>
                      <div className="text-xs text-foreground/85 mt-1">{f.remark}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <aside className="space-y-4 lg:sticky lg:top-6">
            {agenda.length ? (
              <div className="rounded-2xl border border-border p-4">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Agenda for this account</div>
                <ul className="space-y-1.5">
                  {agenda.map((a: any, i: number) => (
                    <li key={i} className="text-[11px] leading-snug">
                      <span className="font-semibold">{a.focus}</span>
                      <span className="text-muted-foreground"> {a.why}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="rounded-2xl border border-border p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Work list</div>
                <button onClick={loadWorklist} className="text-[11px] text-primary">Refresh</button>
              </div>
              {worklist ? (
                <>
                  <div className="grid grid-cols-2 gap-1.5 mb-2 text-[11px]">
                    <span className="text-amber-400">{worklist.counts.awaiting_fix} awaiting fix</span>
                    <span className="text-sky-400">{worklist.counts.rechecking} rechecking</span>
                    <span className="text-muted-foreground">{worklist.counts.in_progress} in progress</span>
                    <span className="text-emerald-400">{worklist.counts.closed_today} closed today</span>
                  </div>
                  <div className="space-y-1.5 max-h-64 overflow-auto">
                    {(worklist.open || []).map((r: any) => (
                      <button key={r.id} onClick={() => openReview(r.id)} className="w-full text-left rounded-lg border border-border p-2 hover:bg-muted/30">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-semibold truncate">{r.client || r.site}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${PILL[r.status] || PILL.queued}`}>{r.status} r{r.round}</span>
                        </div>
                        <div className="text-[10px] text-muted-foreground">{r.executive || "unassigned"} | {r.updated_at ? new Date(r.updated_at).toLocaleString() : ""}</div>
                      </button>
                    ))}
                    {!(worklist.open || []).length ? <p className="text-[11px] text-muted-foreground">Nothing open. Run a check to start one.</p> : null}
                  </div>
                </>
              ) : <p className="text-[11px] text-muted-foreground">Loading...</p>}
            </div>

            <div className="rounded-2xl border border-border p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Executives</div>
                <button onClick={loadProfiles} className="text-[11px] text-primary">Load</button>
              </div>
              <div className="space-y-2 max-h-64 overflow-auto">
                {profiles.map((p, i) => (
                  <div key={i} className="rounded-lg border border-border p-2">
                    <div className="text-[11px] font-semibold">{p.executive}</div>
                    <div className="text-[10px] text-muted-foreground">{p.first_pass_rate}% clean first pass, {p.average_rounds} rounds avg, {p.items_checked} items</div>
                    {(p.recurring_mistakes || []).length ? <div className="text-[10px] mt-0.5">{p.recurring_mistakes.slice(0, 3).map((m: any) => `${m.category} (${m.count})`).join(", ")}</div> : null}
                  </div>
                ))}
                {!profiles.length ? <p className="text-[11px] text-muted-foreground">Load to see profiles built from real QA history.</p> : null}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
