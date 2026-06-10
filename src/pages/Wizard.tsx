import { useState } from "react";
import PortalNav from "@/components/PortalNav";
import { useProject } from "@/contexts/ProjectContext";

/* Build 12.23c (rev) — Engagement Wizard UI.
   Paste a client conversation -> classify into a wizard archetype ->
   run each stage via the wizard_* actions, with an honest readiness and
   validation badge on every stage. Connect-data stages offer a real
   connection path (Google OAuth start, or an in-wizard CSV upload that
   ingests immediately). Mirrors the Lead Intake stepper and design
   language. All platform calls go through /api/task-engine. */

const post = (a: string, b: any = {}) =>
  fetch("/api/task-engine", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: a, ...b }),
  }).then(r => r.json()).catch(() => ({}));

const READINESS: any = {
  ready:            { label: "Ready",            color: "#10b981" },
  needs_connection: { label: "Needs connection", color: "#f59e0b" },
  needs_input:      { label: "Needs input",      color: "#f59e0b" },
  manual_review:    { label: "Manual review",    color: "#a78bfa" },
  blocked:          { label: "Blocked",          color: "#ef4444" },
  gap:              { label: "No engine",        color: "#ef4444" },
};
const STATUS: any = {
  completed:        { label: "Completed",   color: "#10b981" },
  manual:           { label: "Manual",      color: "#a78bfa" },
  needs_input:      { label: "Needs input", color: "#f59e0b" },
  needs_connection: { label: "Not connected", color: "#f59e0b" },
  error:            { label: "Error",       color: "#ef4444" },
};

const chip = (color: string) => ({ color, borderColor: color + "55", background: color + "11" });
const cleanDomain = (d: string) => String(d || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
const isConnectStage = (s: any) => (s?.capabilities || []).some((c: any) => c.id === "gsc_metrics_per_url" || c.id === "gsc_query_page_pairs");

export default function Wizard() {
  const proj = useProject() as any;
  const projectId = proj?.projectId || proj?.project?.id || (typeof localStorage !== "undefined" ? localStorage.getItem("seo_season_proj") : "") || "";
  const projectName = proj?.project?.name || "";

  const [chatText, setChatText]       = useState("");
  const [plan, setPlan]               = useState<any>(null);
  const [classifying, setClassifying] = useState(false);
  const [error, setError]             = useState("");
  const [results, setResults]         = useState<Record<string, any>>({});
  const [running, setRunning]         = useState<string>("");
  const [connecting, setConnecting]   = useState<string>("");
  const [uploading, setUploading]     = useState<string>("");
  const [uploadingAds, setUploadingAds] = useState<string>("");
  const [gscSites, setGscSites]       = useState<any[]>([]);   // properties to pick from
  const [pickerStage, setPickerStage] = useState<string>("");  // stage id the picker is for
  const [gscBusy, setGscBusy]         = useState<string>("");   // status during select+pull
  const [keywords, setKeywords]       = useState("");
  const [competitors, setCompetitors] = useState("");

  const classify = async () => {
    if (!chatText.trim()) return;
    setClassifying(true); setError(""); setPlan(null); setResults({});
    const r: any = await post("wizard_compose", { chatText: chatText.trim() });
    if (r?.success && r?.plan) setPlan(r.plan);
    else setError(r?.error || "Classification failed.");
    setClassifying(false);
  };

  const runStage = async (s: any) => {
    if (!projectId) { setError("No active project found. Select a project, then run project-scoped stages."); return; }
    const caps = s.capability_ids || (s.capabilities || []).map((c: any) => c.id);
    setRunning(s.id); setError("");
    const inputs: any = {};
    if (keywords.trim()) inputs.targetKeywords = keywords.split(",").map(k => k.trim()).filter(Boolean);
    if (competitors.trim()) inputs.competitors = competitors.split(",").map(c => c.trim()).filter(Boolean);
    const r: any = await post("wizard_run_stage", { projectId, capabilityIds: caps, stageLabel: s.label, inputs });
    setResults(prev => ({ ...prev, [s.id]: r?.result || { status: "error", note: r?.error || "Stage failed." } }));
    setRunning("");
  };

  /* Start Google OAuth. Note: after consent the account is linked, but the
     property must still be selected and pulled (in Integrations). We re-run
     the stage on return so it reflects whatever data is now available. */
  const connectGsc = async (s: any) => {
    if (!projectId) { setError("No active project found."); return; }
    setConnecting(s.id); setError("");
    const r: any = await post("gsc_oauth_start", { projectId });
    if (!r?.url) { setConnecting(""); setError(r?.error || "Could not start the Google connection."); return; }
    window.open(r.url, "gsc_oauth", "width=520,height=640");
    const onMsg = async (e: MessageEvent) => {
      if ((e.data || {}).type !== "gsc_connected") return;
      window.removeEventListener("message", onMsg);
      /* Account linked — now list the properties so the user can pick one. */
      const lp: any = await post("gsc_list_properties", { projectId });
      setConnecting("");
      const sites = Array.isArray(lp?.sites) ? lp.sites : [];
      if (sites.length === 0) { setError("Connected, but no Search Console properties were found for this Google account."); return; }
      setGscSites(sites);
      setPickerStage(s.id);
    };
    window.addEventListener("message", onMsg);
  };

  /* Pick a property -> select it for this project -> pull its data -> re-run. */
  const pickProperty = async (s: any, siteUrl: string) => {
    if (!projectId) return;
    setGscBusy("Selecting property…");
    const sel: any = await post("gsc_select_property", { projectId, siteUrl, label: siteUrl });
    if (!sel?.success) { setGscBusy(""); setError(sel?.error || "Could not select that property."); return; }
    setGscBusy("Pulling Search Console data…");
    const pull: any = await post("gsc_pull", { projectId });
    setGscBusy(""); setPickerStage(""); setGscSites([]);
    if (!pull?.success) { setError(pull?.error || "Property selected, but the data pull failed. Try the stage again in a moment."); return; }
    runStage(s);
  };

  /* In-wizard CSV ingestion — fully completes the connect step for a project
     without OAuth. Reads the file and ingests, then re-runs the stage. */
  const uploadCsv = async (s: any, file: File | undefined) => {
    if (!file) return;
    if (!projectId) { setError("No active project found."); return; }
    setUploading(s.id); setError("");
    try {
      const text = await file.text();
      const r: any = await post("wizard_ingest_gsc_csv", { projectId, csvs: [{ filename: file.name, text }] });
      setUploading("");
      if (!r?.success) { setError(r?.error || r?.report?.summary || "CSV ingestion failed."); return; }
      runStage(s);
    } catch (e: any) {
      setUploading(""); setError(e?.message || "Could not read the file.");
    }
  };

  const uploadAdsCsv = async (s: any, file: File | undefined) => {
    if (!file) return;
    if (!projectId) { setError("No active project found."); return; }
    setUploadingAds(s.id); setError("");
    try {
      const text = await file.text();
      const r: any = await post("wizard_ingest_ads_csv", { projectId, csvText: text, filename: file.name });
      setUploadingAds("");
      if (!r?.success) { setError(r?.error || "Ads CSV ingestion failed."); return; }
      runStage(s);
    } catch (e: any) { setUploadingAds(""); setError(e?.message || "Could not read the file."); }
  };

  const downloadReport = (s: any, result: any) => {
    if (!result?.output) return;
    const blob = new Blob([JSON.stringify(result.output, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${s.id || "stage"}-report.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  const downloadExport = (result: any) => {
    const f = result?.output;
    if (!f?.xlsx_base64) return;
    const a = document.createElement("a");
    a.href = "data:" + f.mime_type + ";base64," + f.xlsx_base64;
    a.download = f.filename || "export.xlsx";
    a.click();
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <PortalNav />
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold mb-1">Engagement Wizard</h1>
          <p className="text-sm text-muted-foreground">Paste a client conversation. The wizard detects what kind of engagement it is, plans the stages against real platform capabilities, and runs each one — with an honest status and validation flag on every step.</p>
        </div>

        {/* Step 1 — paste the chat */}
        <div className="rounded-2xl border border-border bg-card p-5 mb-6">
          <div className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wider">Client conversation</div>
          <textarea
            className="w-full h-40 px-4 py-3 rounded-xl border border-border bg-background text-sm outline-none focus:border-primary resize-y"
            placeholder="Paste the full client chat or brief here…"
            value={chatText} onChange={e => setChatText(e.target.value)} />
          <div className="flex items-center justify-between mt-3 gap-3">
            <span className="text-xs text-muted-foreground">
              {projectName ? `Active project: ${projectName}` : projectId ? `Project: ${String(projectId).slice(0, 8)}…` : "No active project selected"}
            </span>
            <button onClick={classify} disabled={classifying || !chatText.trim()}
              className="px-6 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-50">
              {classifying ? "Composing…" : "Decompose & Plan"}
            </button>
          </div>
          {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
        </div>

        {/* Step 2 — the plan */}
        {plan && (
          <>
            {/* Active-project banner — data stages run against THIS project, not the chat. */}
            <div className="rounded-2xl border p-4 mb-4" style={chip("#f59e0b")}>
              <div className="text-xs font-semibold mb-1" style={{ color: "#f59e0b" }}>⚠ Which site will be analysed</div>
              <p className="text-xs text-muted-foreground">
                Data stages run against the <span className="font-semibold">active project</span> selected in the menu bar
                {projectName ? <> — currently <span className="font-semibold">{projectName}</span></> : projectId ? <> — currently project <span className="font-semibold">{String(projectId).slice(0, 8)}…</span></> : <> — <span className="font-semibold">none selected</span></>}.
                {plan.client_domain ? <> This brief is about <span className="font-semibold">{plan.client_domain}</span>.</> : null}
                {" "}Confirm the active project is this client. If it is a different site (or you have not connected the client's data yet), the results will be about that other site — not the client. For a new prospect with no data yet, connect or upload the client's GSC on the relevant stage first.
              </p>
            </div>

            <div className="rounded-2xl border border-border bg-card p-5 mb-6">
              <div className="flex items-center justify-between mb-2 gap-3">
                <h2 className="text-lg font-bold">{plan.archetype_label}</h2>
                <span className="text-xs px-2 py-1 rounded-lg bg-primary/10 text-primary border border-primary/30 whitespace-nowrap">{plan.confidence}% confidence</span>
              </div>
              <p className="text-sm text-muted-foreground mb-2">{plan.summary}</p>
              {plan.ymyl && (
                <span className="inline-block text-xs px-2 py-1 rounded-lg border mb-1" style={chip("#f59e0b")}>
                  YMYL / regulated — trust calls held for human review
                </span>
              )}
              {plan.exclusions?.length > 0 && (
                <div className="text-xs text-muted-foreground mt-2"><span className="font-semibold">Client excluded:</span> {plan.exclusions.join("; ")}</div>
              )}
            </div>

            <div className="rounded-2xl border border-border bg-card p-5 mb-6">
              <div className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">Target keywords (optional — for AI Overview stages)</div>
              <input
                className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-sm outline-none focus:border-primary"
                placeholder="comma, separated, keywords"
                value={keywords} onChange={e => setKeywords(e.target.value)} />
              <div className="text-xs font-semibold text-muted-foreground mt-3 mb-2 uppercase tracking-wider">Competitor domains (for competitor benchmarking — you curate these)</div>
              <input
                className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-sm outline-none focus:border-primary"
                placeholder="competitor1.com, competitor2.com"
                value={competitors} onChange={e => setCompetitors(e.target.value)} />
            </div>

            <div className="space-y-3">
              {plan.stages?.map((s: any, i: number) => {
                const rd = READINESS[s.readiness] || { label: s.readiness, color: "#94a3b8" };
                const res = results[s.id];
                const st = res ? (STATUS[res.status] || { label: res.status, color: "#94a3b8" }) : null;
                const connectStage = isConnectStage(s);
                /* Offer connect tools on a connect stage until it has completed. */
                const showConnect = connectStage && (!res || res.status === "needs_connection");
                return (
                  <div key={s.id} className="rounded-2xl border border-border bg-card p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center flex-wrap gap-2 mb-1">
                          <span className="text-xs text-muted-foreground">{i + 1}</span>
                          <span className="font-semibold text-sm">{s.label}</span>
                          {/* Before a run: the static requirement. After a run: the real status. */}
                          {!st && <span className="text-xs px-2 py-0.5 rounded-md border" style={chip(rd.color)}>Requires: {rd.label}</span>}
                          {st && <span className="text-xs px-2 py-0.5 rounded-md border" style={chip(st.color)}>{st.label}</span>}
                        </div>
                        <p className="text-xs text-muted-foreground">{s.note}</p>
                        {s.capabilities?.length > 0 && (
                          <p className="text-[11px] text-muted-foreground/70 mt-1">Engine: {s.capabilities.map((c: any) => c.engine).join(", ")}</p>
                        )}
                      </div>
                      <button onClick={() => runStage(s)} disabled={running === s.id || s.readiness === "blocked" || s.is_gap}
                        className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 disabled:opacity-50 whitespace-nowrap">
                        {running === s.id ? "Running…" : s.is_gap ? "No engine" : s.readiness === "blocked" ? "Blocked" : res ? "Re-run" : "Run stage"}
                      </button>
                    </div>

                    {/* Connect affordances for GSC-backed stages */}
                    {showConnect && (
                      <div className="mt-3 pt-3 border-t border-border">
                        <p className="text-xs text-muted-foreground mb-2">This stage needs Search Console data for the active project. Connect Google and pick the property here, or upload a GSC export to use it right away.</p>
                        <div className="flex flex-wrap items-center gap-2">
                          <button onClick={() => connectGsc(s)} disabled={connecting === s.id || !!gscBusy}
                            className="text-xs px-3 py-1.5 rounded-lg bg-primary/10 text-primary border border-primary/30 hover:bg-primary/20 disabled:opacity-50">
                            {connecting === s.id ? "Opening…" : "Connect with Google"}
                          </button>
                          <label className="text-xs px-3 py-1.5 rounded-lg bg-primary/10 text-primary border border-primary/30 hover:bg-primary/20 cursor-pointer">
                            {uploading === s.id ? "Ingesting…" : "Upload GSC CSV"}
                            <input type="file" accept=".csv,text/csv" className="hidden"
                              onChange={e => uploadCsv(s, e.target.files?.[0])} disabled={uploading === s.id} />
                          </label>
                        </div>

                        {/* Property picker — shown after OAuth lists the account's properties */}
                        {pickerStage === s.id && (
                          <div className="mt-3">
                            <p className="text-xs font-semibold text-muted-foreground mb-2">Pick the Search Console property for this project:</p>
                            {gscBusy ? (
                              <p className="text-xs text-primary">{gscBusy}</p>
                            ) : (
                              <div className="flex flex-col gap-1.5">
                                {gscSites.map((site: any) => (
                                  <button key={site.url} onClick={() => pickProperty(s, site.url)}
                                    className="text-left text-xs px-3 py-2 rounded-lg border border-border bg-background hover:border-primary">
                                    <span className="font-medium">{site.url}</span>
                                    {site.perm && <span className="text-muted-foreground ml-2">({site.perm})</span>}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Ads upload for the paid-vs-organic stage */}
                    {(s.capabilities || []).some((c: any) => c.id === "paid_organic_substitution") && (!res || res.status === "needs_input") && (
                      <div className="mt-3 pt-3 border-t border-border">
                        <p className="text-xs text-muted-foreground mb-2">This stage needs the client's Google Ads search-terms export to compare paid spend against organic. Paid data is never estimated — upload the real export.</p>
                        <label className="text-xs px-3 py-1.5 rounded-lg bg-primary/10 text-primary border border-primary/30 hover:bg-primary/20 cursor-pointer">
                          {uploadingAds === s.id ? "Ingesting…" : "Upload Google Ads CSV"}
                          <input type="file" accept=".csv,text/csv" className="hidden"
                            onChange={e => uploadAdsCsv(s, e.target.files?.[0])} disabled={uploadingAds === s.id} />
                        </label>
                      </div>
                    )}

                    {res && (
                      <div className="mt-3 pt-3 border-t border-border">
                        {plan.client_domain && res.output?.project_domain && cleanDomain(res.output.project_domain) !== cleanDomain(plan.client_domain) && (
                          <div className="mb-2 p-2 rounded-md border" style={chip("#ef4444")}>
                            <span className="text-[11px] font-semibold" style={{ color: "#ef4444" }}>⚠ Wrong site: this ran against {cleanDomain(res.output.project_domain)}, but the brief is about {cleanDomain(plan.client_domain)}. The active project does not match the client — select/connect the client's project, then re-run. Do not use this output.</span>
                          </div>
                        )}
                        {res.validation && (
                          <span className="inline-block text-[11px] px-2 py-0.5 rounded-md mb-2 border"
                            style={chip(res.validation === "unvalidated" ? "#f59e0b" : "#10b981")}>
                            {res.validation === "unvalidated" ? "Unvalidated engine — scrutinise output" : "Established engine"}
                          </span>
                        )}
                        <p className="text-xs text-muted-foreground mb-1">{res.note}</p>
                        {res.ran_engine && <p className="text-[11px] text-muted-foreground/70 mb-2">Ran: {res.ran_engine}</p>}
                        {res.output?.by_classification && (
                          <div className="text-xs text-muted-foreground mb-2">
                            {Object.entries(res.output.by_classification).map(([k, v]: any) => `${v} ${k}`).join(" · ")} across {res.output.total_urls} URLs
                          </div>
                        )}
                        {res.output && res.status === "completed" && (
                          <button onClick={() => downloadReport(s, res)}
                            className="text-xs px-3 py-1.5 rounded-lg bg-primary/10 text-primary border border-primary/30 hover:bg-primary/20 mr-2">
                            ⬇ Download report (JSON)
                          </button>
                        )}
                        {res.output?.xlsx_base64 && (
                          <button onClick={() => downloadExport(res)}
                            className="text-xs px-3 py-1.5 rounded-lg bg-primary/10 text-primary border border-primary/30 hover:bg-primary/20">
                            ⬇ Download {res.output.filename}
                          </button>
                        )}
                        {res.error && <p className="text-xs text-red-400 mt-1">{res.error}</p>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {plan.gaps?.length > 0 && (
              <div className="rounded-2xl border p-5 mt-6" style={chip("#f59e0b")}>
                <div className="text-xs font-semibold mb-2 uppercase tracking-wider" style={{ color: "#f59e0b" }}>Gaps</div>
                {plan.gaps.map((g: any, i: number) => (
                  <p key={i} className="text-xs text-muted-foreground mb-1"><span className="font-semibold">{g.stage}:</span> {g.note}</p>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
