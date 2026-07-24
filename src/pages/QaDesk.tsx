import { useState, useEffect } from "react";
import PortalNav from "@/components/PortalNav";
import { useProject } from "@/contexts/ProjectContext";

/* QA Desk.
   A standing quality assurance operation over delivery workbooks. Every tab is
   checked in bounded slots so nothing times out, every result is saved and
   reloadable, corrections come back as recheck rounds, and the reviewed workbook
   is downloadable with the QA remark written against every row. All platform
   calls go through /api/task-engine. */

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
const STATUS_STYLE: Record<string, string> = {
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

export default function QaDesk() {
  const proj: any = useProject();
  const projectId = proj?.selectedProjectId || localStorage.getItem("seo_season_proj") || "";
  const projectUrl = proj?.selectedProject?.url || "";

  const [execName, setExecName] = useState("");
  const [clientName, setClientName] = useState("");
  const [siteUrl, setSiteUrl] = useState("");
  const [clientContext, setClientContext] = useState("");
  const [mailText, setMailText] = useState("");
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

  useEffect(() => {
    if (projectUrl && !siteUrl.trim()) setSiteUrl(projectUrl.startsWith("http") ? projectUrl : `https://${projectUrl}/`);
    loadWorklist();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectUrl]);

  const loadWorklist = async () => {
    const r: any = await post("wizard_qa_worklist", {});
    if (r?.success) setWorklist(r);
  };
  const loadProfiles = async () => {
    const r: any = await post("wizard_qa_profile", { executiveName: "" });
    if (r?.success) setProfiles(r.executives || []);
  };

  /* Read every tab of the workbook in the browser. */
  const onWorkbook = async (fileList: FileList | null) => {
    const f = (fileList || [])[0];
    if (!f) return;
    setBusy("Reading every tab of the workbook...");
    try {
      const XLSX: any = await import(/* @vite-ignore */ "https://esm.sh/xlsx@0.18.5");
      const wb = XLSX.read(new Uint8Array(await f.arrayBuffer()), { type: "array" });
      const out: Sheet[] = [];
      for (const name of (wb.SheetNames || [])) {
        try {
          const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: "" });
          const headers = rows.length ? Object.keys(rows[0]) : [];
          out.push({ name, headers, rows });
        } catch { /* skip an unreadable tab */ }
      }
      setSheets(out); setFileName(f.name);
      setBusy(`${out.length} tab(s) read, ${out.reduce((a, s) => a + s.rows.length, 0)} rows in total.`);
    } catch (e: any) { setBusy(""); setError(`Could not read the workbook. ${e?.message || ""}`); }
  };

  const startReview = async () => {
    setError(""); setFindings([]); setSummary(null); setProgress({});
    if (!siteUrl.trim()) { setError("Enter the client site URL."); return; }
    if (!sheets.length) { setError("Upload the delivery workbook first."); return; }
    setRunning(true); setBusy("Setting the QA agenda for this account...");
    const created: any = await post("wizard_qa_create", {
      projectId, siteUrl: siteUrl.trim(), clientName, executiveName: execName,
      clientContext, mailText,
      tabs: sheets.map((s) => ({ name: s.name, headers: s.headers, rowCount: s.rows.length })),
    });
    if (!created?.success) { setRunning(false); setBusy(""); setError(created?.error || "Could not start the review."); return; }
    setReviewId(created.review.id); setAgenda(created.agenda || []);
    await runAllTabs(created.review.id);
  };

  /* Each tab, and each slice within it, is its own call. */
  const runAllTabs = async (rid: string) => {
    const collected: any[] = [];
    for (let ti = 0; ti < sheets.length; ti++) {
      const sheet = sheets[ti];
      let offset = 0;
      if (!sheet.rows.length) { setProgress((p) => ({ ...p, [ti]: { checked: 0, total: 0, done: true, remark: "Empty tab." } })); continue; }
      while (true) {
        setBusy(`Tab ${ti + 1} of ${sheets.length} (${sheet.name}): rows ${offset + 1} to ${Math.min(offset + SLOT, sheet.rows.length)} of ${sheet.rows.length}`);
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
    setBusy("Finalising...");
    const fin: any = await post("wizard_qa_finalize", { reviewId: rid });
    setSummary(fin?.success ? fin : null);
    setRunning(false); setBusy("");
    loadWorklist();
  };

  const openRecheck = async () => {
    if (!reviewId) return;
    setBusy("Opening a recheck round...");
    const r: any = await post("wizard_qa_recheck", { reviewId });
    setBusy("");
    if (!r?.success) { setError(r?.error || "Could not open a recheck round."); return; }
    setSummary(null); setFindings([]); setProgress({});
    setError("");
    alert(`Round ${r.round} is open and marked as rechecking. ${r.to_recheck} item(s) need to be resubmitted. Upload the corrected workbook and run again.`);
    loadWorklist();
  };

  /* The reviewed workbook, with the QA remark written against every row. */
  const downloadAnnotated = async () => {
    if (!sheets.length) return;
    setBusy("Building the reviewed workbook...");
    try {
      const XLSX: any = await import(/* @vite-ignore */ "https://esm.sh/xlsx@0.18.5");
      const wb = XLSX.utils.book_new();
      for (let ti = 0; ti < sheets.length; ti++) {
        const sheet = sheets[ti];
        const byRow = new Map<number, any>();
        for (const f of findings) { if (f.tab_index === ti) byRow.set(f.row_index, f); }
        const rows = sheet.rows.map((r, i) => {
          const f = byRow.get(i);
          return { ...r,
            "QA status": f ? f.status : "not checked",
            "QA severity": f ? (f.severity || "") : "",
            "QA mistake type": f ? (f.mistake_category || "") : "",
            "QA observed live": f ? (f.observed || "") : "",
            "QA remark": f ? (f.remark || "") : "",
          };
        });
        const ws = XLSX.utils.json_to_sheet(rows);
        XLSX.utils.book_append_sheet(wb, ws, sheet.name.slice(0, 31));
      }
      const tabRemarks = sheets.map((s, i) => ({ Tab: s.name, "Rows checked": progress[i]?.checked ?? 0, "Reviewer remark": progress[i]?.remark || "" }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(tabRemarks), "QA remarks");
      if (agenda.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(agenda.map((a: any) => ({ Focus: a.focus, Why: a.why, Weight: a.weight }))), "QA agenda");
      XLSX.writeFile(wb, `QA reviewed ${fileName || "workbook"}`.replace(/\.xlsx?$/i, "") + ".xlsx");
      setBusy("");
    } catch (e: any) { setBusy(""); setError(`Could not build the workbook. ${e?.message || ""}`); }
  };

  const openReview = async (id: string) => {
    setBusy("Loading the saved review...");
    const r: any = await post("wizard_qa_load", { reviewId: id });
    setBusy("");
    if (!r?.success) { setError(r?.error || "Could not load."); return; }
    setReviewId(id); setAgenda(r.review.agenda || []);
    setFindings((r.findings || []).map((f: any) => ({ ...f, tab_index: -1 })));
    setSummary({ totals: r.review.totals || {}, status: r.review.status, round: r.review.round, verdict: `Saved review, round ${r.review.round}, status ${r.review.status}.`, open_items: (r.findings || []).filter((f: any) => f.status === "failed" || f.status === "partial").map((f: any) => ({ tab: f.tab_name, item: f.item, url: f.url, status: f.status, severity: f.severity, remark: f.remark })), mistake_pattern: [] });
    setSiteUrl(r.review.site_url || "");
  };

  const t = summary?.totals || {};

  return (
    <div className="min-h-screen bg-background text-foreground">
      <PortalNav />
      <div className="max-w-6xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-1">QA Desk</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Every tab of the delivery workbook checked against what is actually live, on an agenda set from the client and project. Each tab runs in its own slot so nothing times out, everything is saved, and corrections come back as recheck rounds.
        </p>

        <div className="rounded-2xl border border-border p-5 mb-5 space-y-3">
          <div className="grid md:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">DM executive</label>
              <input className="w-full mt-1 bg-muted/40 border border-border rounded-xl px-3 py-2 text-sm" placeholder="Who did the work" value={execName} onChange={(e) => setExecName(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Client</label>
              <input className="w-full mt-1 bg-muted/40 border border-border rounded-xl px-3 py-2 text-sm" placeholder="Client name" value={clientName} onChange={(e) => setClientName(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Client site</label>
              <input className="w-full mt-1 bg-muted/40 border border-border rounded-xl px-3 py-2 text-sm" placeholder="https://client.com/" value={siteUrl} onChange={(e) => setSiteUrl(e.target.value)} />
            </div>
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Client persona, chat and call</label>
              <textarea className="w-full mt-1 h-24 bg-muted/40 border border-border rounded-xl px-3 py-2 text-sm" placeholder="What this client cares about. Sets the QA agenda." value={clientContext} onChange={(e) => setClientContext(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Commitment mail to the PM</label>
              <textarea className="w-full mt-1 h-24 bg-muted/40 border border-border rounded-xl px-3 py-2 text-sm" placeholder="What was promised. Also sets the agenda." value={mailText} onChange={(e) => setMailText(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Delivery workbook (all tabs)</label>
            <input type="file" accept=".xlsx,.xls,.csv" className="block w-full mt-1 text-xs text-muted-foreground file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border file:border-border file:bg-muted/40 file:text-xs" onChange={(e) => onWorkbook(e.target.files)} />
            {sheets.length ? (
              <div className="flex flex-wrap gap-2 mt-2">
                {sheets.map((s, i) => (
                  <span key={i} className="text-[11px] px-2 py-0.5 rounded-full border border-border bg-muted/30">
                    {s.name} ({s.rows.length} rows){progress[i] ? ` ${progress[i].checked}/${progress[i].total}` : ""}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <button onClick={startReview} disabled={running} className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-60">
              {running ? "Checking..." : "Start QA"}
            </button>
            {reviewId ? <button onClick={downloadAnnotated} className="px-3 py-2 rounded-xl border border-border text-sm">Download reviewed workbook</button> : null}
            {reviewId && summary && summary.status === "awaiting_fix" ? <button onClick={openRecheck} className="px-3 py-2 rounded-xl border border-sky-500/40 text-sky-400 text-sm">Open recheck round</button> : null}
            {busy ? <span className="text-xs text-muted-foreground">{busy}</span> : null}
          </div>
          {error ? <p className="text-sm text-red-400">{error}</p> : null}
        </div>

        {agenda.length ? (
          <div className="rounded-2xl border border-border p-5 mb-5">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">QA agenda for this account</div>
            <ul className="space-y-1">
              {agenda.map((a: any, i: number) => (
                <li key={i} className="text-xs"><span className="font-semibold">{a.focus}</span> <span className="text-muted-foreground">({a.weight}): {a.why}</span></li>
              ))}
            </ul>
          </div>
        ) : null}

        {summary ? (
          <div className={`rounded-2xl border p-5 mb-5 ${summary.status === "passed" ? "border-emerald-500/40 bg-emerald-500/10" : "border-amber-500/40 bg-amber-500/10"}`}>
            <div className="text-sm font-bold mb-1">Round {summary.round}: {summary.status === "passed" ? "passed" : "not clean"}</div>
            <p className="text-sm text-foreground/90">{summary.verdict}</p>
            <div className="flex flex-wrap gap-3 mt-2 text-xs">
              <span className="text-emerald-400">{t.verified || 0} verified</span>
              <span className="text-amber-400">{t.partial || 0} partial</span>
              <span className="text-red-400">{t.failed || 0} failed</span>
              <span className="text-muted-foreground">{t.unverifiable || 0} unverifiable</span>
            </div>
            {(summary.mistake_pattern || []).length ? (
              <div className="mt-3 text-xs">
                <span className="text-muted-foreground">Mistake pattern this round: </span>
                {summary.mistake_pattern.map((m: any, i: number) => <span key={i} className="mr-2">{m.category} ({m.count})</span>)}
              </div>
            ) : null}
          </div>
        ) : null}

        {findings.length ? (
          <div className="rounded-2xl border border-border p-5 mb-5">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Findings ({findings.length})</div>
            <div className="space-y-2 max-h-[520px] overflow-auto">
              {findings.filter((f) => f.status !== "verified").concat(findings.filter((f) => f.status === "verified")).map((f, i) => (
                <div key={i} className="rounded-xl border border-border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="text-sm font-semibold">{f.item}</div>
                    <span className={`text-[11px] px-2 py-0.5 rounded-full border whitespace-nowrap ${STATUS_STYLE[f.status] || STATUS_STYLE.queued}`}>{f.status}{f.severity ? ` / ${f.severity}` : ""}</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">{f.tab_name}{f.url ? ` | ${String(f.url).replace(/^https?:\/\//, "")}` : ""}</div>
                  <div className="text-xs text-foreground/85 mt-1">{f.remark}</div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="grid md:grid-cols-2 gap-5">
          <div className="rounded-2xl border border-border p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Work list</div>
              <button onClick={loadWorklist} className="text-[11px] text-primary">Refresh</button>
            </div>
            {worklist ? (
              <>
                <div className="flex flex-wrap gap-3 text-xs mb-3">
                  <span className="text-amber-400">{worklist.counts.awaiting_fix} awaiting fix</span>
                  <span className="text-sky-400">{worklist.counts.rechecking} rechecking</span>
                  <span className="text-muted-foreground">{worklist.counts.in_progress} in progress</span>
                  <span className="text-emerald-400">{worklist.counts.closed_today} closed today</span>
                </div>
                <div className="space-y-2 max-h-72 overflow-auto">
                  {(worklist.open || []).map((r: any) => (
                    <button key={r.id} onClick={() => openReview(r.id)} className="w-full text-left rounded-xl border border-border p-2.5 hover:bg-muted/30">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold">{r.client || r.site}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border ${STATUS_STYLE[r.status] || STATUS_STYLE.queued}`}>{r.status} r{r.round}</span>
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        {r.executive || "unassigned"} | updated {r.updated_at ? new Date(r.updated_at).toLocaleString() : "n/a"}
                      </div>
                    </button>
                  ))}
                  {!(worklist.open || []).length ? <p className="text-xs text-muted-foreground">Nothing open.</p> : null}
                </div>
              </>
            ) : <p className="text-xs text-muted-foreground">Loading...</p>}
          </div>

          <div className="rounded-2xl border border-border p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Executive profiles</div>
              <button onClick={loadProfiles} className="text-[11px] text-primary">Load</button>
            </div>
            <div className="space-y-3 max-h-72 overflow-auto">
              {profiles.map((p, i) => (
                <div key={i} className="rounded-xl border border-border p-3">
                  <div className="text-sm font-semibold">{p.executive}</div>
                  <div className="text-[11px] text-muted-foreground">{p.reviews} review(s), {p.items_checked} items checked, {p.first_pass_rate}% clean on first pass, {p.clean_rate_all_rounds}% clean overall, {p.average_rounds} rounds on average</div>
                  {(p.recurring_mistakes || []).length ? (
                    <div className="text-[11px] mt-1"><span className="text-muted-foreground">Recurring: </span>{p.recurring_mistakes.map((m: any) => `${m.category} (${m.count})`).join(", ")}</div>
                  ) : null}
                  {(p.weakest_areas || []).length ? (
                    <div className="text-[11px] mt-0.5"><span className="text-muted-foreground">Weakest areas: </span>{p.weakest_areas.map((m: any) => `${m.area} (${m.issues})`).join(", ")}</div>
                  ) : null}
                  {(p.projects || []).length ? <div className="text-[11px] mt-0.5 text-muted-foreground">Projects: {p.projects.slice(0, 4).join(", ")}</div> : null}
                </div>
              ))}
              {!profiles.length ? <p className="text-xs text-muted-foreground">Load to see profiles built from real QA history.</p> : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
