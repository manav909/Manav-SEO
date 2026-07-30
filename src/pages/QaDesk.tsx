import { useState, useEffect, useRef } from "react";
import PortalNav from "@/components/PortalNav";
import { useProject } from "@/contexts/ProjectContext";
import { useAuth } from "@/contexts/AuthContext";

/* QA Desk.

   Built in the order a reviewer actually works:
     1 Brief      what was promised, and what this client judges work by
     2 Evidence   the project, Search Console and a full crawl, IN HAND before
                  a single claimed row is judged
     3 Submitted  the executive's workbook
     4 Review     every row checked against the evidence, tab by tab
     5 Verdict    remarks, documents, and the gate that holds the client summary

   Colour carries state everywhere: slate is idle, sky is working, emerald is
   clean, amber needs work, red is blocking. All calls go to /api/task-engine. */

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

const TONE: Record<string, string> = {
  idle: "text-muted-foreground border-border bg-muted/20",
  work: "text-sky-400 border-sky-500/40 bg-sky-500/10",
  good: "text-emerald-400 border-emerald-500/40 bg-emerald-500/10",
  warn: "text-amber-400 border-amber-500/40 bg-amber-500/10",
  bad: "text-red-400 border-red-500/40 bg-red-500/10",
};
const STATUS_TONE: Record<string, string> = {
  verified: TONE.good, partial: TONE.warn, failed: TONE.bad, unverifiable: TONE.idle,
  passed: TONE.good, awaiting_fix: TONE.warn, rechecking: TONE.work, checking: TONE.work, queued: TONE.idle,
};
const RING: Record<string, string> = { idle: "border-border", work: "border-sky-500/50", good: "border-emerald-500/40", warn: "border-amber-500/40", bad: "border-red-500/50" };

type Cols = { urlKey: string; valueKey: string; itemKey: string; refKey: string };
type Sheet = { name: string; headers: string[]; rows: any[]; headerRows: number; columns: Cols; mapping?: any };

/* The column mapping is decided once, from the WHOLE sheet, and then used for
   every batch. Deciding it per batch let the fallback lock onto a different
   column in different batches, which is how a row could be checked against a URL
   belonging to another row. */
function pickColumns(headers: string[], rows: any[]): Cols {
  const n = (x: string) => String(x || "").toLowerCase().trim();
  const find = (re: RegExp) => headers.find((h) => re.test(n(h))) || "";
  let urlKey = find(/^url$|page url|landing page|\burl\b|\bpage\b|link|address|slug/);
  if (!urlKey) {
    /* Score by DISTINCT URLs, not by how many cells hold a URL. A real page list
       carries many different pages; a reference or template column repeats the
       same link on every row, and would otherwise win simply by being fuller. */
    let best = ""; let bestScore = 0;
    for (const h of headers) {
      const vals = rows.map((r) => String(r[h] || "").trim()).filter((v) => /^https?:\/\/|^www\./i.test(v));
      const distinct = new Set(vals.map((v) => v.toLowerCase())).size;
      if (distinct > bestScore) { bestScore = distinct; best = h; }
    }
    if (bestScore >= Math.max(2, Math.floor(rows.length * 0.2))) urlKey = best;
  }
  return {
    urlKey,
    valueKey: find(/new (title|meta|value|content|h1)|updated|implemented|optimi[sz]ed|revised|final|after/) || find(/^title$|^meta|description|^h1$|value|content|anchor|text/) || "",
    itemKey: find(/task|item|activity|work|deliverable|description of work/) || "",
    refKey: find(/^#$|^s\.?no\.?$|^sr\.?$|^id$|^row$|serial/) || "",
  };
}

/* Rows taken from ACROSS the sheet rather than off the top. A column has to hold
   what it claims all the way down, and the first few rows of a delivery sheet are
   often the least representative: a leading block can be blank, or hold a summary
   line, which is enough to hide a genuine page column and send the whole tab down
   the site level path. */
function spreadRows(rows: any[], n: number): any[] {
  if (!Array.isArray(rows) || rows.length <= n) return Array.isArray(rows) ? rows : [];
  const step = Math.ceil(rows.length / n);
  const out: any[] = [];
  for (let i = 0; i < rows.length && out.length < n; i += step) out.push(rows[i]);
  return out;
}

function Stage({ n, title, hint, tone = "idle", children }: any) {
  return (
    <section className={`rounded-2xl border bg-card/40 overflow-hidden ${RING[tone] || RING.idle}`}>
      <header className="flex items-center gap-3 px-5 py-3 border-b border-border/60">
        <span className={`w-7 h-7 shrink-0 rounded-full grid place-items-center text-[11px] font-bold border ${TONE[tone]}`}>
          {tone === "good" ? "\u2713" : n}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold leading-tight">{title}</h2>
          {hint ? <p className="text-[11px] text-muted-foreground leading-tight">{hint}</p> : null}
        </div>
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}

function Bar({ pct, tone = "work" }: { pct: number; tone?: string }) {
  const fill = tone === "good" ? "bg-emerald-500" : tone === "warn" ? "bg-amber-500" : tone === "bad" ? "bg-red-500" : "bg-sky-500";
  return <div className="h-1.5 rounded-full bg-muted overflow-hidden"><div className={`h-full ${fill} transition-all`} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} /></div>;
}

export default function QaDesk() {
  const proj: any = useProject();
  const auth: any = useAuth();
  const navProjectId = proj?.selectedProjectId || localStorage.getItem("seo_season_proj") || "";
  const navProjectName = proj?.selectedProject?.name || "";
  const navProjectUrl = proj?.selectedProject?.url || "";

  const [dmeName, setDmeName] = useState(() => localStorage.getItem("qa_last_dme") || "");
  const [bdeName, setBdeName] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientName, setClientName] = useState("");
  const [siteUrl, setSiteUrl] = useState("");
  /* Provenance. A value that came from a default may be replaced by real evidence
     read out of the conversation. A value the reviewer typed is never overwritten.
     Without this, a site URL pre-filled from the nav project silently beat the
     client's actual domain, which then dragged the project and Search Console
     checks onto the wrong site. */
  const [srcSite, setSrcSite] = useState<"" | "default" | "read" | "typed">("");
  const [clientContext, setClientContext] = useState("");
  const [mailText, setMailText] = useState("");
  const [extracted, setExtracted] = useState<any>(null);
  const [clients, setClients] = useState<any[]>([]);
  const [clientLoaded, setClientLoaded] = useState<any>(null);

  const [projectId, setProjectId] = useState(navProjectId);
  const [projectLabel, setProjectLabel] = useState(navProjectName);
  const [gsc, setGsc] = useState<any>(null);
  const [gscSites, setGscSites] = useState<any[]>([]);
  const [gscPulling, setGscPulling] = useState(false);
  const [setupBusy, setSetupBusy] = useState("");

  const [crawl, setCrawl] = useState<any>(null);
  const [crawlJobId, setCrawlJobId] = useState("");
  const [crawling, setCrawling] = useState(false);
  const [siteAudit, setSiteAudit] = useState<any>(null);
  const [crawlWhy, setCrawlWhy] = useState("");

  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [fileName, setFileName] = useState("");
  const [mapping, setMapping] = useState(false);
  const [reviewId, setReviewId] = useState("");
  const [agenda, setAgenda] = useState<any[]>([]);
  const [progress, setProgress] = useState<Record<number, { checked: number; total: number; done: boolean; remark: string }>>({});
  const [findings, setFindings] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [activity, setActivity] = useState<Array<{ t: string; msg: string; kind: string }>>([]);
  const [dir, setDir] = useState<any>(null);
  const [dirQuery, setDirQuery] = useState("");
  const [dirBusy, setDirBusy] = useState(false);
  const [worklist, setWorklist] = useState<any>(null);

  const siteDomain = dom(siteUrl);
  const projDomain = dom(navProjectUrl);
  /* Coverage is confirmed, mismatched, or UNKNOWN. Unknown was previously
     treated as confirmed, which is how the screen came to print
     "lawnq.com.au covers boxflow.co.uk" beside a green matched badge. Nothing
     shows green unless it has actually been verified against the site. */
  const coverage: "none" | "confirmed" | "mismatch" | "unknown" =
    !projectId ? "none"
    : !siteDomain ? "unknown"
    : projDomain && projectId === navProjectId ? (projDomain === siteDomain ? "confirmed" : "mismatch")
    : projectId !== navProjectId ? "confirmed"          // a project created here for this exact site
    : "unknown";                                         // project carries no URL, so it cannot be confirmed
  const mismatch = coverage === "mismatch";

  /* Search Console is only usable when the bound property is THIS site. A
     property for another domain is another client's data and must never read as
     ready, whatever its connection state. */
  const gscDomain = dom(String(gsc?.resourceId || gsc?.resourceLabel || "").replace(/^sc-domain:/, ""));
  const gscWrongSite = Boolean(gscDomain && siteDomain && gscDomain !== siteDomain);
  const gscConnected = Boolean(gsc?.connected) && !mismatch;
  const gscBound = gscConnected && Boolean(gsc?.resourceId) && !gscWrongSite;
  const gscReady = gscBound && Boolean(gsc?.lastPullAt);
  /* A crawl that only reached the homepage, or that reported a reason it could
     not proceed, is not evidence. */
  const crawlReady = Boolean(crawl?.complete) && Number(crawl?.done || 0) > 1 && !crawlWhy;

  const stopCrawl = useRef(false);
  const stopReview = useRef(false);

  const log = (msg: string, kind = "run") => setActivity((a) => [{ t: new Date().toLocaleTimeString(), msg, kind }, ...a].slice(0, 200));

  useEffect(() => {
    if (navProjectUrl && !siteUrl.trim()) { setSiteUrl(navProjectUrl.startsWith("http") ? navProjectUrl : `https://${navProjectUrl}/`); setSrcSite("default"); }
    loadWorklist(); loadDirectory(""); loadClients();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navProjectUrl]);
  useEffect(() => { if (projectId) refreshGsc(projectId); }, [projectId]);

  const loadClients = async () => { const r: any = await post("wizard_qa_clients", {}); if (r?.success) setClients(r.clients || []); };

  /* Everything already known about this client is filled in, so the same
     conversation is never pasted twice. Anything already on screen is kept: a
     stored record fills the blanks, it does not overwrite work in progress. */
  const loadClient = async (id: string) => {
    const cid = String(id || "").trim();
    if (!cid) return;
    setBusy("Loading the client record...");
    const r: any = await post("wizard_qa_load_client", { clientId: cid });
    setBusy("");
    if (!r?.success) { setClientLoaded(null); return; }
    const c = r.client;
    if (c.client_name && !clientName.trim()) setClientName(c.client_name);
    if (c.bde_name && !bdeName.trim()) setBdeName(c.bde_name);
    if (c.client_context && !clientContext.trim()) setClientContext(c.client_context);
    if (c.mail_text && !mailText.trim()) setMailText(c.mail_text);
    if (c.site_url && srcSite !== "typed" && !siteUrl.trim()) { setSiteUrl(c.site_url); setSrcSite("read"); }
    setClientLoaded(c);
    log(`Client record loaded for ${c.client_name || cid}, from ${c.reviews_count} previous review(s)`, "ok");
  };

  const loadDirectory = async (query: string) => {
    setDirBusy(true);
    const r: any = await post("wizard_qa_directory", { query });
    setDirBusy(false);
    if (r?.success) setDir(r);
  };

  const loadWorklist = async () => { const r: any = await post("wizard_qa_worklist", {}); if (r?.success) setWorklist(r); };
  const refreshGsc = async (pid: string) => { const r: any = await post("gsc_status", { projectId: pid }); setGsc(r?.success === false ? null : r); };

  const readContext = async () => {
    if (!clientContext.trim() && !mailText.trim()) { setError("Paste the client chat, call notes or the mail first."); return; }
    setError(""); setBusy("Reading the chat and calls..."); log("Reading the chat, calls and mail");
    const r: any = await post("wizard_qa_extract_context", { chatText: clientContext, mailText });
    setBusy("");
    if (!r?.success) { setError(r?.error || "Could not read the context."); return; }
    if (r.client_id && !clientId.trim()) setClientId(r.client_id);
    if (r.client_name && !clientName.trim()) setClientName(r.client_name);
    if (r.bde_name && !bdeName.trim()) setBdeName(r.bde_name);
    if (r.site_url && srcSite !== "typed") {
      const next = r.site_url.startsWith("http") ? r.site_url : `https://${r.site_url}/`;
      if (dom(next) !== dom(siteUrl)) {
        setSiteUrl(next); setSrcSite("read");
        log(`Website read from the conversation: ${dom(next)}${siteUrl ? `, replacing the ${dom(siteUrl)} default` : ""}`, "warn");
      }
    }
    setExtracted(r);
    log(`Record filled: ${r.client_name || r.client_id || "client"}`, "ok");
  };

  const createProjectForSite = async () => {
    if (!siteDomain) { setError("Enter the client site first."); return; }
    setError(""); setSetupBusy("Creating the project..."); log(`Creating a project for ${siteDomain}`);
    const r: any = await post("wizard_create_project", { name: clientName.trim() || siteDomain, domain: siteUrl.trim(), userId: auth?.user?.id || "" });
    setSetupBusy("");
    if (!r?.success || !r?.projectId) { setError(r?.error || "Could not create the project."); return; }
    setProjectId(r.projectId); setProjectLabel(clientName.trim() || siteDomain);
    log("Project created and bound to this review", "ok");
    refreshGsc(r.projectId);
  };

  const loadGscProperties = async (pid: string) => {
    setSetupBusy("Loading the Search Console properties...");
    const r: any = await post("gsc_list_properties", { projectId: pid });
    setSetupBusy("");
    const sites = (r?.sites || []).filter(Boolean);
    setGscSites(sites);
    log(sites.length ? `${sites.length} Search Console property(ies) found` : "No properties on this Google account", sites.length ? "ok" : "warn");
    if (!sites.length && r?.error) setError(r.error);
  };

  const connectGsc = async () => {
    if (!projectId) { setError("Create or select the project for this site first."); return; }
    setError(""); setSetupBusy("Opening Google..."); 
    const r: any = await post("gsc_oauth_start", { projectId });
    setSetupBusy("");
    if (!r?.url) { setError(r?.error || "Could not start the Search Console connection."); return; }
    log("Waiting for the Google authorisation window");
    window.open(r.url, "gsc_oauth", "width=520,height=640");
    let settled = false;
    const finish = async () => {
      if (settled) return; settled = true;
      window.removeEventListener("message", onMsg);
      log("Authorised, reading the account", "ok");
      const st: any = await post("gsc_status", { projectId });
      setGsc(st);
      if (st?.connected && !st?.resourceId) await loadGscProperties(projectId);
    };
    const onMsg = (e: MessageEvent) => { if ((e.data || {}).type === "gsc_connected") finish(); };
    window.addEventListener("message", onMsg);
    let tries = 0;
    const poll = setInterval(async () => {
      if (settled || tries++ > 40) { clearInterval(poll); return; }
      const st: any = await post("gsc_status", { projectId });
      if (st?.connected) { clearInterval(poll); finish(); }
    }, 3000);
  };

  const chooseProperty = async (site: any) => {
    const u = String(site?.siteUrl || site?.url || site || "");
    if (!u) return;
    setSetupBusy(`Binding ${u}...`); log(`Selecting property ${u}`);
    const r: any = await post("gsc_select_property", { projectId, siteUrl: u, label: u });
    if (!r?.success) { setSetupBusy(""); setError(r?.error || "Could not select that property."); log("Property selection failed", "err"); return; }
    setGscSites([]); await pullGsc();
  };

  const pullGsc = async () => {
    setGscPulling(true); setSetupBusy("Pulling Search Console data..."); log("Pulling Search Console data");
    const r: any = await post("gsc_pull", { projectId, days: 28, source: "manual" });
    setGscPulling(false); setSetupBusy("");
    if (!r?.success) { setError(r?.error || "The pull did not complete."); log("Search Console pull failed", "warn"); }
    else log("Search Console data pulled", "ok");
    await refreshGsc(projectId);
  };

  /* Evidence: the whole site, crawled in batches, before any row is judged. */
  const runCrawl = async () => {
    if (!siteUrl.trim()) { setError("Enter the client site first."); return ""; }
    stopCrawl.current = false; setCrawlWhy("");
    setCrawling(true); setError(""); log(`Starting the full site crawl of ${siteDomain}`);
    let jobId = ""; let guard = 0;
    try {
      while (guard++ < 400) {
        if (stopCrawl.current) { log(`Crawl stopped by you at ${crawl?.done || 0} pages. The pages already crawled stay usable.`, "warn"); break; }
        const r: any = await post("wizard_crawl_batch", jobId ? { projectId, jobId } : { projectId, siteUrl: siteUrl.trim(), mode: "advanced" });
        if (!r?.success) { setError(r?.error || "The crawl could not run."); log(`Crawl stopped: ${r?.error || "failed"}`, "err"); break; }
        jobId = r.jobId || jobId;
        setCrawl({ jobId, done: r.done, total: r.total, complete: r.complete });
        if (r.diagnosis?.reason) { setCrawlWhy(r.diagnosis.reason); log(r.diagnosis.reason, "warn"); }
        else if (r.render_note) log(r.render_note, "run");
        log(`Crawled ${r.done} of ${r.total} pages`, r.complete ? "ok" : "run");
        if (r.complete) break;
      }
    } catch (e: any) { setError(String(e?.message || e)); log("Crawl error", "err"); }
    setCrawling(false);
    if (jobId) setCrawlJobId(jobId);
    return jobId;
  };

  const onWorkbook = async (fileList: FileList | null) => {
    const f = (fileList || [])[0];
    if (!f) return;
    setBusy("Reading every tab..."); log(`Opening ${f.name}`);
    try {
      const XLSX: any = await import(/* @vite-ignore */ "https://esm.sh/xlsx@0.18.5");
      const wb = XLSX.read(new Uint8Array(await f.arrayBuffer()), { type: "array" });
      const out: Sheet[] = [];
      for (const name of (wb.SheetNames || [])) {
        try {
          const ws = wb.Sheets[name];
          let rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
          let headers = rows.length ? Object.keys(rows[0]) : [];
          let headerRows = 1;
          /* When the first row is a title or a banner, the parser names the
             columns __EMPTY, __EMPTY_1 and so on. That is the signal that the
             real header row is further down, so find it and re-read from there.
             Otherwise every column name is meaningless and the tab looks
             uncheckable when it is perfectly fine. */
          const blank = headers.filter((h) => /^__EMPTY/.test(h)).length;
          if (headers.length && blank >= Math.max(1, Math.floor(headers.length * 0.4))) {
            const grid: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
            const hi = grid.findIndex((row) =>
              Array.isArray(row) &&
              row.filter((c) => String(c || "").trim()).length >= 2 &&
              row.some((c) => /url|page|title|meta|description|keyword|link|address|status|anchor|alt|schema/i.test(String(c || ""))));
            if (hi > 0) {
              const re = XLSX.utils.sheet_to_json(ws, { range: hi, defval: "" });
              if (re.length) { rows = re; headers = Object.keys(re[0]); headerRows = hi + 1; }
            }
          }
          out.push({ name, headers, rows, headerRows, columns: pickColumns(headers, rows) });
        } catch { /* skip an unreadable tab */ }
      }
      setSheets(out); setFileName(f.name); setBusy("");
      log(`${out.length} tab(s) read, ${out.reduce((a, x) => a + x.rows.length, 0)} rows total`, "ok");

      /* Read every tab and work out what it records, then show that reading so it
         can be corrected before anything is judged. */
      setMapping(true); setBusy("Reading what each tab records...");
      const mr: any = await post("wizard_qa_map_tabs", {
        siteUrl: siteUrl.trim(),
        tabs: out.map((sh) => ({
          name: sh.name, headers: sh.headers, rowCount: sh.rows.length,
          sample: sh.rows.slice(0, 3),
          validationRows: spreadRows(sh.rows, 60),
          columns: sh.columns,
        })),
      });
      setMapping(false); setBusy("");
      if (mr?.success) {
        const byName = new Map<string, any>((mr.mappings || []).map((m: any) => [m.name, m]));
        setSheets(out.map((sh) => ({ ...sh, mapping: byName.get(sh.name) || null })));
        const weak = (mr.mappings || []).filter((m: any) => m.confidence === "low").length;
        log(`Interpreted ${(mr.mappings || []).length} tab(s)${weak ? `, ${weak} needing a look` : ""}`, weak ? "warn" : "ok");
      } else log("Could not interpret the tabs, falling back to column names", "warn");
    } catch (e: any) { setBusy(""); setError(`Could not read the workbook. ${e?.message || ""}`); }
  };

  const rememberDme = (v: string) => { setDmeName(v); try { localStorage.setItem("qa_last_dme", v); } catch { /* storage optional */ } };

  const startReview = async () => {
    setError(""); setFindings([]); setSummary(null); setProgress({});
    if (!siteUrl.trim()) { setError("Enter the client site."); return; }
    if (!sheets.length) { setError("Upload the delivery workbook."); return; }
    stopReview.current = false;
    setRunning(true); setBusy("Setting the agenda..."); log("Setting the QA agenda from the client record");
    const created: any = await post("wizard_qa_create", {
      projectId, siteUrl: siteUrl.trim(), clientId, clientName,
      executiveName: dmeName, bdeName, clientContext, mailText,
      keywords: extracted?.keywords || [], competitors: extracted?.competitor_sites || [],
      tabs: sheets.map((s) => ({ name: s.name, headers: s.headers, rowCount: s.rows.length })),
    });
    if (!created?.success) { setRunning(false); setBusy(""); setError(created?.error || "Could not start the review."); return; }
    const rid = created.review.id;
    setReviewId(rid); setAgenda(created.agenda || []);
    log(`Agenda set with ${(created.agenda || []).length} focus point(s)`, "ok");
    if (created.gsc?.note) log(created.gsc.note, created.gsc.usable ? "ok" : "warn");

    const collected: any[] = [];
    for (let ti = 0; ti < sheets.length; ti++) {
      if (stopReview.current) { log("Review paused by you. Everything checked so far is saved.", "warn"); break; }
      const sheet = sheets[ti];
      if (!sheet.rows.length) { setProgress((p) => ({ ...p, [ti]: { checked: 0, total: 0, done: true, remark: "Empty tab." } })); continue; }
      let offset = 0;
      while (true) {
        if (stopReview.current) { log(`Paused inside ${sheet.name}. Checked rows are saved.`, "warn"); break; }
        setBusy(`${sheet.name}: rows ${offset + 1} to ${Math.min(offset + SLOT, sheet.rows.length)} of ${sheet.rows.length}`);
        /* The interpretation, the whole sheet column choice and the header offset
           go with EVERY batch. They are decided once for the tab, so sending them
           each time is what stops the engine deriving columns from the slice in
           front of it, which is how a row could be checked against a URL that
           belongs somewhere else. headerRows travels too, so a finding's row
           number matches the row the executive sees when the real headers sit
           below a banner. */
        const r: any = await post("wizard_qa_check_tab", {
          reviewId: rid, tabIndex: ti, rowOffset: offset,
          rows: sheet.rows.slice(offset, offset + SLOT), totalRows: sheet.rows.length,
          mapping: sheet.mapping || null, columns: sheet.columns, headerRows: sheet.headerRows,
        });
        if (!r?.success) { setError(`${sheet.name}: ${r?.error || "check failed"}`); log(`${sheet.name} failed: ${r?.error || ""}`, "err"); break; }
        for (const f of (r.findings || [])) collected.push({ ...f, tab_name: sheet.name, tab_index: ti });
        setFindings([...collected]);
        setProgress((p) => ({ ...p, [ti]: { checked: r.rows_checked, total: r.row_count, done: r.done, remark: r.tab_remark || "" } }));
        const bad = (r.findings || []).filter((x: any) => x.status !== "verified").length;
        log(`${sheet.name}: ${r.rows_checked}/${r.row_count} checked${bad ? `, ${bad} not clean` : ""}`, bad ? "warn" : "run");
        if (r.done || r.next_offset == null) break;
        offset = r.next_offset;
      }
    }

    if (crawlJobId) {
      setBusy("Auditing every crawled page...");
      log("Auditing every crawled page for site wide issues");
      const a: any = await post("wizard_qa_site_audit", { reviewId: rid, jobId: crawlJobId });
      if (a?.success) { setSiteAudit(a); log(a.summary, a.blocking ? "warn" : "ok"); }
    }

    setBusy("Reconciling against the commitments...");
    log("Reconciling the workbook against the commitment mail");
    const fin: any = await post("wizard_qa_finalize", { reviewId: rid });
    setSummary(fin?.success ? fin : null);
    if (fin?.success) log(fin.verdict, fin.ready_to_submit ? "ok" : "warn");
    setRunning(false); setBusy(""); loadWorklist(); loadClients();
  };

  const openRecheck = async () => {
    if (!reviewId) return;
    const r: any = await post("wizard_qa_recheck", { reviewId });
    if (!r?.success) { setError(r?.error || "Could not open a recheck round."); return; }
    setSummary(null); setFindings([]); setProgress({}); setError("");
    log(`Round ${r.round} open for recheck, ${r.to_recheck} item(s)`, "warn");
    loadWorklist();
  };

  /* Render the report as a real document: headings, tables and lists, printable
     to PDF and saveable as Word, rather than raw markdown on a page. */
  const mdToHtml = (md: string) => {
    const esc = (x: string) => String(x || "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] || c));
    const lines = String(md || "").split("\n");
    const out: string[] = [];
    let table: string[][] = [];
    const flushTable = () => {
      if (!table.length) return;
      const [head, ...body] = table;
      out.push(`<table><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`);
      table = [];
    };
    for (const raw of lines) {
      const line = raw.trimEnd();
      if (/^\|(.+)\|$/.test(line)) {
        const cells = line.slice(1, -1).split("|").map((c) => c.trim());
        if (cells.every((c) => /^-{2,}$/.test(c) || c === "")) continue;   // separator row
        table.push(cells); continue;
      }
      flushTable();
      if (/^### /.test(line)) out.push(`<h3>${esc(line.slice(4))}</h3>`);
      else if (/^## /.test(line)) out.push(`<h2>${esc(line.slice(3))}</h2>`);
      else if (/^# /.test(line)) out.push(`<h1>${esc(line.slice(2))}</h1>`);
      else if (/^- /.test(line)) out.push(`<li>${esc(line.slice(2)).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")}</li>`);
      else if (!line.trim()) out.push("");
      else out.push(`<p>${esc(line).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")}</p>`);
    }
    flushTable();
    return out.join("\n").replace(/(<li>[\s\S]*?<\/li>\n?)+/g, (m) => `<ul>${m}</ul>`);
  };

  const docShell = (title: string, md: string) => `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>
    body{font:14px/1.6 -apple-system,system-ui,Segoe UI,sans-serif;color:#16161d;max-width:940px;margin:36px auto;padding:0 26px}
    h1{font-size:22px;margin:0 0 4px} h2{font-size:16px;margin:26px 0 8px;border-bottom:1px solid #e6e6ee;padding-bottom:6px}
    h3{font-size:14px;margin:16px 0 4px} p{margin:7px 0} ul{margin:7px 0 7px 18px;padding:0} li{margin:3px 0}
    table{border-collapse:collapse;width:100%;margin:10px 0;font-size:12.5px}
    th,td{border:1px solid #e6e6ee;padding:6px 8px;text-align:left;vertical-align:top}
    th{background:#f6f6fa;font-weight:600} tr:nth-child(even) td{background:#fbfbfd}
    .meta{color:#6b6b80;font-size:12px;margin-top:28px;border-top:1px solid #e6e6ee;padding-top:10px}
    @media print{ .noprint{display:none} body{margin:0} }
  </style></head><body>
    <div class="noprint" style="margin-bottom:14px"><button onclick="window.print()" style="padding:6px 12px;font:13px system-ui;cursor:pointer">Print or save as PDF</button></div>
    ${mdToHtml(md)}
    <p class="meta">Prepared by Manav S. Generated ${new Date().toLocaleString()}.</p>
  </body></html>`;

  const openDoc = (title: string, md: string) => {
    if (!md) { setError("That document is not available for this review."); return; }
    const tab = window.open("", "_blank");
    if (tab) { tab.document.write(docShell(title, md)); tab.document.close(); }
  };

  const downloadDoc = (title: string, md: string) => {
    if (!md) return;
    const blob = new Blob([docShell(title, md)], { type: "application/msword" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${title} ${clientName || siteDomain || "review"}.doc`;
    a.click(); URL.revokeObjectURL(a.href);
    log(`${title} downloaded`, "ok");
  };

  const downloadAnnotated = async () => {
    if (!sheets.length) return;
    setBusy("Building the reviewed workbook..."); log("Writing remarks into the workbook");
    try {
      const XLSX: any = await import(/* @vite-ignore */ "https://esm.sh/xlsx@0.18.5");
      const wb = XLSX.utils.book_new();
      for (let ti = 0; ti < sheets.length; ti++) {
        const byRow = new Map<number, any>();
        for (const f of findings) if (f.tab_index === ti) byRow.set(f.row_index, f);
        const rows = sheets[ti].rows.map((r, i) => {
          const f = byRow.get(i);
          return { ...r, "QA status": f ? f.status : "not checked", "QA severity": f?.severity || "", "QA mistake type": f?.mistake_category || "", "QA observed live": f?.observed || "", "QA remark": f?.remark || "" };
        });
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), sheets[ti].name.slice(0, 31));
      }
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sheets.map((s, i) => ({ Tab: s.name, "Rows checked": progress[i]?.checked ?? 0, "Reviewer remark": progress[i]?.remark || "" }))), "QA remarks");
      if (agenda.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(agenda.map((a: any) => ({ Focus: a.focus, Why: a.why, Weight: a.weight }))), "QA agenda");
      XLSX.writeFile(wb, `QA reviewed ${fileName || "workbook"}`.replace(/\.xlsx?$/i, "") + ".xlsx");
      setBusy(""); log("Reviewed workbook downloaded", "ok");
    } catch (e: any) { setBusy(""); setError(`Could not build the workbook. ${e?.message || ""}`); }
  };

  const openReview = async (id: string) => {
    const r: any = await post("wizard_qa_load", { reviewId: id });
    if (!r?.success) { setError(r?.error || "Could not load."); return; }
    setReviewId(id); setAgenda(r.review.agenda || []);
    setSiteUrl(r.review.site_url || ""); setSrcSite("typed");
    setClientId(r.review.client_id || ""); setClientName(r.review.client_name || "");
    if (r.review.executive_name) rememberDme(r.review.executive_name);
    setBdeName(r.review.bde_name || "");
    setFindings((r.findings || []).map((f: any) => ({ ...f, tab_index: -1 })));
    setSummary(r.report ? { ...r.report, status: r.review.status } : { totals: r.review.totals || {}, status: r.review.status, round: r.review.round, verdict: `Saved review, round ${r.review.round}, status ${r.review.status}.`, documents: null });
    log(`Loaded saved review for ${r.review.client_name || r.review.site_url}`, "ok");
  };

  const t = summary?.totals || {};
  const totalRows = sheets.reduce((a, s) => a + s.rows.length, 0);
  const s1: string = (siteUrl.trim() && (clientContext.trim() || mailText.trim())) ? "good" : "idle";
  const s2: string = mismatch ? "warn" : (projectId && crawlReady) ? "good" : (crawling || setupBusy) ? "work" : "idle";
  const s3: string = sheets.length ? "good" : "idle";
  const s4: string = running ? "work" : findings.length ? (findings.some((f) => f.status === "failed") ? "bad" : findings.some((f) => f.status === "partial") ? "warn" : "good") : "idle";
  const s5: string = summary ? (summary.ready_to_submit ? "good" : "bad") : "idle";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <PortalNav />
      <div className="max-w-6xl mx-auto px-4 py-8">

        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">QA Desk</h1>
            <p className="text-sm text-muted-foreground">The checkpoint between finished work and the client.</p>
          </div>
          <span className={`text-xs px-3 py-1.5 rounded-full border font-semibold ${summary ? (summary.ready_to_submit ? TONE.good : TONE.bad) : TONE.idle}`}>
            {summary ? (summary.ready_to_submit ? "Cleared to send" : "Held: do not send") : "Nothing checked yet"}
          </span>
        </div>

        {/* Evidence in hand, visible at all times */}
        <div className="grid sm:grid-cols-3 gap-2 mb-5">
          <div className={`rounded-xl border px-3 py-2 ${coverage === "confirmed" ? TONE.good : coverage === "none" ? TONE.idle : TONE.warn}`}>
            <div className="text-[10px] uppercase tracking-wider opacity-80">Project</div>
            <div className="text-xs font-semibold truncate">
              {coverage === "confirmed" ? `${projectLabel || navProjectName || siteDomain} covers ${siteDomain}`
                : coverage === "mismatch" ? `${projDomain} is not ${siteDomain}`
                : coverage === "unknown" ? `Cannot confirm it covers ${siteDomain || "this site"}`
                : "Not set"}
            </div>
          </div>
          <div className={`rounded-xl border px-3 py-2 ${gscReady ? TONE.good : (gscWrongSite || gscConnected) ? TONE.warn : TONE.idle}`}>
            <div className="text-[10px] uppercase tracking-wider opacity-80">Search Console</div>
            <div className="text-xs font-semibold truncate">
              {gscWrongSite ? `${gscDomain} is not ${siteDomain}, not used`
                : gscReady ? (gsc?.resourceLabel || gsc?.resourceId)
                : gscBound ? "Bound, not pulled"
                : gscConnected ? "Pick a property" : "Not connected"}
            </div>
          </div>
          <div className={`rounded-xl border px-3 py-2 ${crawlReady ? TONE.good : crawling ? TONE.work : TONE.idle}`}>
            <div className="text-[10px] uppercase tracking-wider opacity-80">Site crawl</div>
            <div className="text-xs font-semibold truncate">
              {crawlReady ? `${crawl.done} pages ready`
                : crawling ? `${crawl?.done || 0} of ${crawl?.total || "?"}`
                : crawl && crawlWhy ? "Crawl did not reach the site"
                : crawl ? `Only ${crawl.done} page, not usable as evidence`
                : "Not crawled"}
            </div>
          </div>
        </div>

        <div className="grid lg:grid-cols-[1fr_320px] gap-5 items-start">
          <div className="space-y-4">

            <Stage n={1} title="Brief" hint="What was promised, and what this client judges the work by." tone={s1}>
              {clientLoaded ? (
                <p className="text-[11px] text-muted-foreground mb-2">
                  Filled from the stored record for {clientLoaded.client_name || clientLoaded.client_id}, last used {clientLoaded.last_seen_at ? new Date(clientLoaded.last_seen_at).toLocaleDateString() : "previously"}. Edit anything that has changed and it will be saved back on the next review.
                </p>
              ) : null}
              <div className="grid md:grid-cols-2 gap-3 mb-3">
                <textarea className="w-full h-24 bg-muted/40 border border-border rounded-xl px-3 py-2 text-sm" placeholder="Client chat and call notes. This sets the QA agenda." value={clientContext} onChange={(e) => setClientContext(e.target.value)} />
                <textarea className="w-full h-24 bg-muted/40 border border-border rounded-xl px-3 py-2 text-sm" placeholder="Commitment mail sent to the project manager." value={mailText} onChange={(e) => setMailText(e.target.value)} />
              </div>
              <button onClick={readContext} className="text-xs px-3 py-1.5 rounded-lg bg-primary/10 text-primary border border-primary/30 mb-3">Fill from chat and calls</button>
              <div className="grid md:grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Client ID (unique)</label>
                  <div className="flex gap-1.5">
                    <input list="qa-clients" className="flex-1 bg-muted/40 border border-border rounded-xl px-3 py-2 text-sm" placeholder="tyler_tg1"
                      value={clientId}
                      onChange={(e) => { setClientId(e.target.value); if (clients.some((c) => c.client_id === e.target.value)) loadClient(e.target.value); }}
                      onBlur={(e) => { if (e.target.value.trim() && !clientLoaded) loadClient(e.target.value); }} />
                    {clientId.trim() ? <button onClick={() => loadClient(clientId)} className="text-xs px-2.5 rounded-xl border border-border whitespace-nowrap">Load</button> : null}
                  </div>
                  <datalist id="qa-clients">
                    {clients.map((c: any, i: number) => <option key={i} value={c.client_id}>{c.client_name || c.site_url}</option>)}
                  </datalist>
                  <p className="text-[10px] mt-1">
                    {clientLoaded
                      ? <span className="text-emerald-400">Record loaded, {clientLoaded.reviews_count} previous review(s). The conversation and mail below came from it.</span>
                      : clients.length ? <span className="text-muted-foreground">{clients.length} client(s) on file, pick one to fill everything</span> : null}
                  </p>
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Client name</label>
                  <input className="w-full bg-muted/40 border border-border rounded-xl px-3 py-2 text-sm" placeholder="Tyler, TG Racing" value={clientName} onChange={(e) => setClientName(e.target.value)} />
                </div>
                <div className="md:col-span-2">
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Client website</label>
                  <input className={`w-full bg-muted/40 border rounded-xl px-3 py-2 text-sm ${srcSite === "read" ? "border-sky-500/50" : "border-border"}`}
                    placeholder="https://client.com/" value={siteUrl}
                    onChange={(e) => { setSiteUrl(e.target.value); setSrcSite("typed"); }} />
                  <p className="text-[10px] mt-1">
                    {srcSite === "read" ? <span className="text-sky-400">Read from the conversation. The work is checked against this site.</span>
                      : srcSite === "default" ? <span className="text-amber-400">Filled from the project selected in the nav. Confirm this is the client being reviewed.</span>
                      : srcSite === "typed" ? <span className="text-muted-foreground">Set by you.</span> : null}
                  </p>
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground">DME who did the work</label>
                  <input list="qa-dmes" className="w-full bg-muted/40 border border-border rounded-xl px-3 py-2 text-sm" placeholder="Set once, remembered after" value={dmeName} onChange={(e) => rememberDme(e.target.value)} />
                  <datalist id="qa-dmes">{(dir?.known_dmes || []).map((n: string, i: number) => <option key={i} value={n} />)}</datalist>
                  <p className="text-[10px] text-muted-foreground mt-1">{(dir?.known_dmes || []).length ? `${dir.known_dmes.length} on file` : "Never in the client chat, so set it here"}</p>
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground">BDE on the account</label>
                  <input list="qa-bdes" className="w-full bg-muted/40 border border-border rounded-xl px-3 py-2 text-sm" placeholder="Read from the chat" value={bdeName} onChange={(e) => setBdeName(e.target.value)} />
                  <datalist id="qa-bdes">{(dir?.known_bdes || []).map((n: string, i: number) => <option key={i} value={n} />)}</datalist>
                  <p className="text-[10px] text-muted-foreground mt-1">{(dir?.known_bdes || []).length ? `${dir.known_bdes.length} on file` : "Found in the conversation"}</p>
                </div>
              </div>
              {extracted ? (
                <div className="mt-3 rounded-xl border border-border bg-muted/20 p-3">
                  {extracted.persona ? <p className="text-xs text-foreground/90">{extracted.persona}</p> : null}
                  {(extracted.priorities || []).length ? <p className="text-[11px] mt-1"><span className="text-muted-foreground">Priorities: </span>{extracted.priorities.join("; ")}</p> : null}
                  {(extracted.pain_points || []).length ? <p className="text-[11px] mt-0.5"><span className="text-muted-foreground">Pain points: </span>{extracted.pain_points.join("; ")}</p> : null}
                  {(extracted.keywords || []).length ? <p className="text-[11px] mt-0.5"><span className="text-muted-foreground">Keywords to judge against: </span>{extracted.keywords.join(", ")}</p> : null}
                  {(extracted.competitor_sites || []).length ? <p className="text-[11px] mt-0.5"><span className="text-muted-foreground">Competitors: </span>{extracted.competitor_sites.join(", ")}</p> : null}
                </div>
              ) : null}
            </Stage>

            <Stage n={2} title="Evidence" hint="The project, Search Console and the whole site, in hand before any row is judged." tone={s2}>
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/20 px-3 py-2.5">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold">Project</div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      {coverage === "mismatch" ? `The nav project is ${navProjectName || projDomain} (${projDomain}), a different site from ${siteDomain}.`
                        : coverage === "confirmed" ? `${projectLabel || navProjectName || projDomain} covers ${siteDomain}.`
                        : coverage === "unknown" ? `The selected project ${navProjectName ? `"${navProjectName}"` : ""} has no website recorded, so it cannot be confirmed as the project for ${siteDomain || "this site"}. Search Console from it is not used.`
                        : "No project selected."}
                    </div>
                  </div>
                  {mismatch || !projectId
                    ? <button onClick={createProjectForSite} className="text-xs px-3 py-1.5 rounded-lg bg-primary/10 text-primary border border-primary/30 whitespace-nowrap">Create for {siteDomain || "this site"}</button>
                    : <span className={`text-[11px] px-2 py-0.5 rounded-full border ${TONE.good}`}>matched</span>}
                </div>

                <div className="rounded-xl border border-border bg-muted/20 px-3 py-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs font-semibold">Search Console</div>
                      <div className="text-[11px] text-muted-foreground truncate">
                        {gscWrongSite ? `Bound to ${gscDomain}, which is not the site being checked. It is left out of this review because it is another site's data.`
                          : mismatch ? "Left out while the project does not match, because that data belongs to another client."
                          : gscReady ? `${gsc?.resourceLabel || gsc?.resourceId}, last pulled ${gsc?.lastPullAt ? new Date(gsc.lastPullAt).toLocaleDateString() : "recently"}.`
                          : gscBound ? `${gsc?.resourceLabel || gsc?.resourceId} is bound. Pull the data to use it.`
                          : gscConnected ? "Authorised. Choose which property belongs to this site."
                          : "Not connected. Optional: the live page checks do not need it."}
                      </div>
                    </div>
                    {mismatch ? null
                      : gscReady ? <span className={`text-[11px] px-2 py-0.5 rounded-full border ${TONE.good}`}>ready</span>
                      : gscBound ? <button onClick={pullGsc} disabled={gscPulling} className="text-xs px-3 py-1.5 rounded-lg bg-primary/10 text-primary border border-primary/30 whitespace-nowrap disabled:opacity-50">{gscPulling ? "Pulling..." : "Pull data"}</button>
                      : gscConnected ? <button onClick={() => loadGscProperties(projectId)} className="text-xs px-3 py-1.5 rounded-lg border border-border whitespace-nowrap">Choose property</button>
                      : <button onClick={connectGsc} disabled={!projectId} className="text-xs px-3 py-1.5 rounded-lg border border-border whitespace-nowrap disabled:opacity-50">Connect</button>}
                  </div>
                  {gscSites.length ? (
                    <div className="mt-2 space-y-1">
                      <div className="text-[10px] text-muted-foreground">Pick the property for {siteDomain || "this site"}.</div>
                      {gscSites.map((st: any, i: number) => {
                        const u = String(st?.siteUrl || st?.url || st || "");
                        const match = siteDomain && u.toLowerCase().includes(siteDomain);
                        return <button key={i} onClick={() => chooseProperty(st)} className={`w-full text-left text-[11px] px-2 py-1.5 rounded-lg border hover:bg-muted/40 ${match ? "border-primary/40 text-primary" : "border-border"}`}>{u}{match ? " (matches this site)" : ""}</button>;
                      })}
                    </div>
                  ) : null}
                </div>

                <div className="rounded-xl border border-border bg-muted/20 px-3 py-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs font-semibold">Whole site crawl</div>
                      <div className="text-[11px] text-muted-foreground truncate">
                        {crawlReady ? `${crawl.done} pages crawled and ready to check against.` : crawling ? `Crawling ${crawl?.done || 0} of ${crawl?.total || "?"} pages, batch by batch.` : "Crawl the site so every claim can be checked against the real pages."}
                      </div>
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      {crawling ? (
                        <button onClick={() => { stopCrawl.current = true; }} className="text-xs px-3 py-1.5 rounded-lg border border-amber-500/40 text-amber-400 whitespace-nowrap">Stop</button>
                      ) : null}
                      <button onClick={runCrawl} disabled={crawling || running} className="text-xs px-3 py-1.5 rounded-lg bg-primary/10 text-primary border border-primary/30 whitespace-nowrap disabled:opacity-50">
                        {crawling ? "Crawling..." : crawlReady ? "Crawl again" : "Crawl the site"}
                      </button>
                    </div>
                  </div>
                  {crawl ? <div className="mt-2"><Bar pct={crawl.total ? (crawl.done / crawl.total) * 100 : 0} tone={crawl.complete ? "good" : "work"} /></div> : null}
                  {crawlWhy ? <p className="text-[11px] text-amber-400 mt-2">{crawlWhy}</p> : null}
                </div>
                {setupBusy ? <p className="text-[11px] text-sky-400">{setupBusy}</p> : null}
              </div>
            </Stage>

            <Stage n={3} title="Submitted work" hint="The executive's workbook. Every tab is read." tone={s3}>
              <label
                onDragOver={(e) => { e.preventDefault(); }}
                onDrop={(e) => { e.preventDefault(); onWorkbook(e.dataTransfer.files); }}
                className={`flex items-center justify-between gap-3 rounded-xl border border-dashed px-4 py-4 cursor-pointer transition-colors ${sheets.length ? "border-emerald-500/40 bg-emerald-500/5 hover:bg-emerald-500/10" : "border-border bg-muted/20 hover:bg-muted/40 hover:border-primary/40"}`}>
                <div className="min-w-0">
                  <div className="text-xs font-semibold">{fileName || "Drop the workbook here, or click to choose"}</div>
                  <div className="text-[11px] text-muted-foreground">{sheets.length ? `${sheets.length} tab(s), ${totalRows} rows ready to review` : "Excel or CSV. Every tab is read."}</div>
                </div>
                <span className="text-xs px-3 py-1.5 rounded-lg bg-primary/10 text-primary border border-primary/30 whitespace-nowrap">{sheets.length ? "Replace" : "Choose file"}</span>
                <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => onWorkbook(e.target.files)} />
              </label>
              {sheets.length ? (
                <div className="mt-3 space-y-1.5">
                  <div className="text-[11px] text-muted-foreground">{sheets.length} tab(s), {totalRows} rows</div>
                  {sheets.map((s, i) => {
                    const p = progress[i]; const pct = p && p.total ? (p.checked / p.total) * 100 : 0;
                    return (
                      <div key={i} className="rounded-lg border border-border px-3 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-medium truncate">{s.name}</span>
                          <span className="text-[10px] text-muted-foreground">{p ? `${p.checked}/${p.total}` : `${s.rows.length} rows`}</span>
                        </div>
                        {s.mapping ? (
                          <div className="text-[10px] mt-1 space-y-1">
                            <div className={s.mapping.confidence === "low" ? "text-amber-400" : "text-muted-foreground"}>
                              {s.mapping.what_it_verifies || "No description available."}
                              {s.mapping.confidence === "low" ? " (low confidence, please check the columns below)" : ""}
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-muted-foreground">Page from</span>
                              <select value={s.mapping.url_column || ""} onChange={(e) => setSheets((prev) => prev.map((x, xi) => xi === i ? { ...x, mapping: { ...x.mapping, url_column: e.target.value, scope: e.target.value ? "page" : "site" } } : x))}
                                className="bg-muted/40 border border-border rounded px-1.5 py-0.5 text-[10px]">
                                <option value="">site level, no page column</option>
                                {s.headers.map((h, hi) => <option key={hi} value={h}>{h}</option>)}
                              </select>
                              <span className="text-muted-foreground">compared to</span>
                              <select value={s.mapping.expected_column || ""} onChange={(e) => setSheets((prev) => prev.map((x, xi) => xi === i ? { ...x, mapping: { ...x.mapping, expected_column: e.target.value } } : x))}
                                className="bg-muted/40 border border-border rounded px-1.5 py-0.5 text-[10px]">
                                <option value="">presence only</option>
                                {s.headers.map((h, hi) => <option key={hi} value={h}>{h}</option>)}
                              </select>
                              {s.mapping.previous_column ? <span className="text-muted-foreground">old value in {s.mapping.previous_column}</span> : null}
                              {s.headerRows > 1 ? <span className="text-sky-400">headers on row {s.headerRows}</span> : null}
                            </div>
                          </div>
                        ) : (
                          <div className="text-[10px] mt-0.5 text-muted-foreground">{mapping ? "Reading this tab..." : "Not interpreted yet."}</div>
                        )}
                        {p ? <div className="mt-1.5"><Bar pct={pct} tone={p.done ? "good" : "work"} /></div> : null}
                        {p?.remark ? <p className="text-[10px] text-muted-foreground mt-1">{p.remark}</p> : null}
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </Stage>

            <Stage n={4} title="Review" hint="Every claimed row checked against the evidence, then the whole site audited." tone={s4}>
              <div className="flex flex-wrap items-center gap-2">
                <button onClick={startReview} disabled={running || !sheets.length}
                  className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50">
                  {running ? "Reviewing..." : "Review the work"}
                </button>
                {running ? <button onClick={() => { stopReview.current = true; }} className="px-3 py-2 rounded-xl border border-amber-500/40 text-amber-400 text-sm">Pause</button> : null}
                {!crawlReady && !running ? <span className="text-[11px] text-amber-400">Crawl the site in step 2 first so rows can be checked against real pages.</span> : null}
                {busy ? <span className="text-xs text-sky-400">{busy}</span> : null}
              </div>
              {error ? <p className="text-sm text-red-400 mt-2">{error}</p> : null}
              {siteAudit ? (
                <div className="mt-3 rounded-xl border border-border bg-muted/20 p-3">
                  <p className="text-xs font-semibold mb-1">{siteAudit.summary}</p>
                  <ul className="space-y-0.5">
                    {(siteAudit.detail || []).map((d: any, i: number) => (
                      <li key={i} className="text-[11px]">
                        <span className={d.severity === "high" ? "text-red-400" : d.severity === "medium" ? "text-amber-400" : "text-muted-foreground"}>[{d.severity}]</span> {d.label}: {d.pages} page(s)
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {findings.length ? (
                <div className="mt-3 space-y-2 max-h-[420px] overflow-auto">
                  {findings.filter((f) => f.status !== "verified").concat(findings.filter((f) => f.status === "verified")).map((f, i) => (
                    <div key={i} className={`rounded-xl border p-3 ${f.status === "failed" ? "border-red-500/30" : f.status === "partial" ? "border-amber-500/30" : "border-border"}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="text-sm font-semibold">{f.item}</div>
                        <span className={`text-[11px] px-2 py-0.5 rounded-full border whitespace-nowrap ${STATUS_TONE[f.status] || TONE.idle}`}>{f.status}{f.severity ? ` / ${f.severity}` : ""}</span>
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        {f.tab_name}{f.sheet_row ? `, sheet row ${f.sheet_row}` : ""}{f.row_ref ? ` (ref ${f.row_ref})` : ""}{f.source_column ? `, URL from column "${f.source_column}"` : ""}
                      </div>
                      {f.url ? (
                        <a href={f.url.startsWith("http") ? f.url : `https://${f.url}`} target="_blank" rel="noreferrer"
                          className="text-[11px] text-primary hover:underline break-all">{String(f.url).replace(/^https?:\/\//, "")}</a>
                      ) : null}
                      <div className="text-xs text-foreground/85 mt-1">{f.remark}</div>
                      {f.expected ? <div className="text-[11px] text-muted-foreground mt-1">Sheet says: {String(f.expected).slice(0, 160)}</div> : null}
                    </div>
                  ))}
                </div>
              ) : null}
            </Stage>

            <Stage n={5} title="Verdict" hint="Remarks back to the executive, or cleared for the client." tone={s5}>
              {!summary ? <p className="text-xs text-muted-foreground">The verdict appears once the review has run.</p> : (
                <>
                  <p className="text-sm text-foreground/90">{summary.verdict}</p>
                  <div className="flex flex-wrap gap-2 mt-3">
                    <span className={`text-[11px] px-2 py-0.5 rounded-full border ${TONE.good}`}>{t.verified || 0} verified</span>
                    <span className={`text-[11px] px-2 py-0.5 rounded-full border ${TONE.warn}`}>{t.partial || 0} partial</span>
                    <span className={`text-[11px] px-2 py-0.5 rounded-full border ${TONE.bad}`}>{t.failed || 0} failed</span>
                    <span className={`text-[11px] px-2 py-0.5 rounded-full border ${TONE.idle}`}>{t.unverifiable || 0} unverifiable</span>
                    {t.site_issues ? <span className={`text-[11px] px-2 py-0.5 rounded-full border ${t.site_blocking ? TONE.bad : TONE.idle}`}>{t.site_issues} site wide ({t.site_blocking || 0} blocking)</span> : null}
                  </div>
                  {(summary.missing || []).length ? <p className="text-xs mt-3"><span className="text-muted-foreground">Promised but not reported: </span><span className="text-amber-400">{summary.missing.map((m: any) => m.title).join(", ")}</span></p> : null}
                  {(summary.quantity || []).map((q: any, i: number) => (
                    <p key={i} className="text-xs mt-1"><span className="font-semibold">{q.title}</span>: committed {q.committed}, reported {q.reported}, live {q.verified}. <span className="text-muted-foreground">{q.note}</span></p>
                  ))}
                  {(summary.mistake_pattern || []).length ? <p className="text-xs mt-2"><span className="text-muted-foreground">Mistake pattern: </span>{summary.mistake_pattern.map((m: any) => `${m.category} (${m.count})`).join(", ")}</p> : null}
                  {summary.gsc ? <p className="text-[11px] text-muted-foreground mt-2">{summary.gsc.note}</p> : null}
                  <div className="flex flex-wrap gap-2 mt-4">
                    {summary.documents ? ([
                      { k: "internal_qa", label: "QA report" },
                      { k: "fix_list", label: "Fix list for the executive" },
                      { k: "client_summary", label: "Client summary" },
                    ]).map((d) => (
                      <span key={d.k} className="inline-flex rounded-lg overflow-hidden border border-primary/30">
                        <button onClick={() => openDoc(d.label, summary.documents[d.k])} className="text-xs px-3 py-1.5 bg-primary/10 text-primary">{d.label}</button>
                        <button onClick={() => downloadDoc(d.label, summary.documents[d.k])} title="Download as Word" className="text-xs px-2 py-1.5 bg-primary/5 text-primary border-l border-primary/30">Save</button>
                      </span>
                    )) : null}
                    <button onClick={downloadAnnotated} className="text-xs px-3 py-1.5 rounded-lg border border-border">Download reviewed workbook</button>
                    {summary.status === "awaiting_fix" ? <button onClick={openRecheck} className="text-xs px-3 py-1.5 rounded-lg border border-sky-500/40 text-sky-400">Open recheck round</button> : null}
                  </div>
                </>
              )}
            </Stage>
          </div>

          <aside className="space-y-4 lg:sticky lg:top-6">
            <div className="rounded-2xl border border-border p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Activity</div>
                <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <span className={`w-1.5 h-1.5 rounded-full ${running || crawling ? "bg-sky-400 animate-pulse" : "bg-muted-foreground/40"}`} />
                  {running || crawling ? "working" : "idle"}
                </span>
              </div>
              <div className="space-y-1 max-h-64 overflow-auto">
                {activity.map((a, i) => (
                  <div key={i} className="flex gap-2 text-[10px] leading-snug">
                    <span className="text-muted-foreground/70 tabular-nums shrink-0">{a.t}</span>
                    <span className={a.kind === "ok" ? "text-emerald-400" : a.kind === "warn" ? "text-amber-400" : a.kind === "err" ? "text-red-400" : "text-foreground/80"}>{a.msg}</span>
                  </div>
                ))}
                {!activity.length ? <p className="text-[11px] text-muted-foreground">Every step appears here as it runs.</p> : null}
              </div>
            </div>

            {agenda.length ? (
              <div className="rounded-2xl border border-border p-4">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Agenda for this account</div>
                <ul className="space-y-1.5">
                  {agenda.map((a: any, i: number) => (
                    <li key={i} className="text-[11px] leading-snug"><span className="font-semibold">{a.focus}</span><span className="text-muted-foreground"> {a.why}</span></li>
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
                  <div className="space-y-1.5 max-h-56 overflow-auto">
                    {(worklist.open || []).map((r: any) => (
                      <button key={r.id} onClick={() => openReview(r.id)} className="w-full text-left rounded-lg border border-border p-2 hover:bg-muted/30">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-semibold truncate">{r.client || r.site}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${STATUS_TONE[r.status] || TONE.idle}`}>{r.status} r{r.round}</span>
                        </div>
                        <div className="text-[10px] text-muted-foreground">{r.executive || "unassigned"} | {r.updated_at ? new Date(r.updated_at).toLocaleString() : ""}</div>
                      </button>
                    ))}
                    {!(worklist.open || []).length ? <p className="text-[11px] text-muted-foreground">Nothing open. Run a review to start one.</p> : null}
                  </div>
                </>
              ) : <p className="text-[11px] text-muted-foreground">Loading...</p>}
            </div>

            <div className="rounded-2xl border border-border p-4">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Directory</div>
              <div className="flex gap-1.5 mb-2">
                <input value={dirQuery} onChange={(e) => setDirQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") loadDirectory(dirQuery); }}
                  placeholder="Name, client, or ask a question"
                  className="flex-1 bg-muted/40 border border-border rounded-lg px-2.5 py-1.5 text-[11px]" />
                <button onClick={() => loadDirectory(dirQuery)} className="text-[11px] px-2.5 py-1.5 rounded-lg bg-primary/10 text-primary border border-primary/30">{dirBusy ? "..." : "Find"}</button>
              </div>
              {dir?.interpreted ? <p className="text-[10px] text-sky-400 mb-2">Read as: {dir.interpreted}</p> : null}
              <div className="space-y-2 max-h-72 overflow-auto">
                {(dir?.executives || []).map((p: any, i: number) => (
                  <button key={i} onClick={() => { rememberDme(p.executive); setDirQuery(p.executive); loadDirectory(p.executive); }}
                    className="w-full text-left rounded-lg border border-border p-2 hover:bg-muted/30">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-semibold truncate">{p.executive}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${p.first_pass_rate >= 80 ? TONE.good : p.first_pass_rate >= 50 ? TONE.warn : TONE.bad}`}>{p.first_pass_rate}% first pass</span>
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      {p.reviews} review(s), {p.projects} project(s){p.open_reviews ? `, ${p.open_reviews} open` : ""}
                    </div>
                    {(p.clients || []).length ? <div className="text-[10px] text-muted-foreground truncate">Clients: {p.clients.slice(0, 3).join(", ")}</div> : null}
                    {(p.recurring_mistakes || []).length ? <div className="text-[10px] text-amber-400/80 truncate mt-0.5">{p.recurring_mistakes.slice(0, 2).map((m: any) => `${m.category} (${m.count})`).join(", ")}</div> : null}
                  </button>
                ))}
                {dir && !(dir.executives || []).length ? <p className="text-[11px] text-muted-foreground">No one matches that. Try a name, a client, or a question such as who keeps missing meta descriptions.</p> : null}
                {!dir ? <p className="text-[11px] text-muted-foreground">Loading...</p> : null}
              </div>
            </div>

          </aside>
        </div>
      </div>
    </div>
  );
}
