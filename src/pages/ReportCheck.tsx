import { useState, useEffect } from "react";
import PortalNav from "@/components/PortalNav";
import { useProject } from "@/contexts/ProjectContext";

/* Work Report Check.
   The delivery cycle in one place: what sales committed in the mail to the PM,
   what the PM reported as completed, and what is actually live on the client site
   right now. Every tick is earned from a live page read, never assumed. Search
   Console is used when it is connected and is never required. All platform calls
   go through /api/task-engine. */

const post = (a: string, b: any = {}) =>
  fetch("/api/task-engine", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: a, ...b }),
  }).then(async (r) => {
    const raw = await r.text();
    try { return JSON.parse(raw); }
    catch { return { success: false, error: r.ok ? "The server returned an unreadable response." : `Request failed (${r.status}). ${raw.slice(0, 140)}` }; }
  }).catch((e) => ({ success: false, error: String(e?.message || e) }));

const STATUS_STYLE: Record<string, string> = {
  verified: "text-emerald-400 border-emerald-500/40 bg-emerald-500/10",
  partial: "text-amber-400 border-amber-500/40 bg-amber-500/10",
  failed: "text-red-400 border-red-500/40 bg-red-500/10",
  unverifiable: "text-muted-foreground border-border bg-muted/30",
};

export default function ReportCheck() {
  const proj: any = useProject();
  const projectId = proj?.selectedProjectId || localStorage.getItem("seo_season_proj") || "";
  const projectName = proj?.selectedProject?.name || "";
  const projectUrl = proj?.selectedProject?.url || "";

  const [siteUrl, setSiteUrl] = useState("");
  const [clientContext, setClientContext] = useState("");
  const [mailText, setMailText] = useState("");
  const [completionText, setCompletionText] = useState("");
  const [fileInfo, setFileInfo] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [res, setRes] = useState<any>(null);

  useEffect(() => {
    if (projectUrl && !siteUrl.trim()) setSiteUrl(projectUrl.startsWith("http") ? projectUrl : `https://${projectUrl}/`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectUrl]);

  /* Completion sheets and documents are read in the browser, exactly as the
     wizard reads client materials, so no server side file handling is needed. */
  const onFiles = async (fileList: FileList | null) => {
    const arr = Array.from(fileList || []);
    if (!arr.length) return;
    const TEXT_EXT = /\.(txt|md|markdown|csv|tsv|json|html?|log|xml|yaml|yml)$/i;
    setFileInfo("Reading files...");
    const extractPdf = async (f: File): Promise<string> => {
      const pdfjs: any = await import(/* @vite-ignore */ "https://esm.sh/pdfjs-dist@4.0.379/build/pdf.min.mjs");
      try { pdfjs.GlobalWorkerOptions.workerSrc = "https://esm.sh/pdfjs-dist@4.0.379/build/pdf.worker.min.mjs"; } catch { /* ignore */ }
      const pdf = await pdfjs.getDocument({ data: await f.arrayBuffer() }).promise;
      let text = "";
      for (let i = 1; i <= pdf.numPages; i++) {
        const content = await (await pdf.getPage(i)).getTextContent();
        text += content.items.map((it: any) => it.str || "").join(" ") + "\n";
      }
      return text.trim();
    };
    const extractDocx = async (f: File): Promise<string> => {
      const mammoth: any = await import(/* @vite-ignore */ "https://esm.sh/mammoth@1.6.0");
      const r = await mammoth.extractRawText({ arrayBuffer: await f.arrayBuffer() });
      return String(r?.value || "").trim();
    };
    const extractXlsx = async (f: File): Promise<string> => {
      const XLSX: any = await import(/* @vite-ignore */ "https://esm.sh/xlsx@0.18.5");
      const wb = XLSX.read(new Uint8Array(await f.arrayBuffer()), { type: "array" });
      let out = "";
      for (const name of (wb.SheetNames || [])) {
        try { const csv = XLSX.utils.sheet_to_csv(wb.Sheets[name]); if (csv && csv.trim()) out += `=== Sheet: ${name} ===\n${csv.trim()}\n\n`; } catch { /* skip sheet */ }
      }
      return out.trim();
    };
    let added = 0; const skipped: string[] = [];
    let text = completionText;
    for (const f of arr) {
      try {
        let t = "";
        if (TEXT_EXT.test(f.name)) t = await f.text();
        else if (/\.pdf$/i.test(f.name)) t = await extractPdf(f);
        else if (/\.docx$/i.test(f.name)) t = await extractDocx(f);
        else if (/\.xlsx?$/i.test(f.name)) t = await extractXlsx(f);
        else { skipped.push(f.name); continue; }
        if (t.trim()) { text += `\n\n=== File: ${f.name} ===\n${t.trim()}`; added++; }
        else skipped.push(f.name);
      } catch { skipped.push(f.name); }
    }
    setCompletionText(text.trim());
    setFileInfo(`${added} file(s) read.${skipped.length ? ` Could not read: ${skipped.join(", ")}` : ""}`);
  };

  const run = async () => {
    setError(""); setRes(null);
    if (!siteUrl.trim()) { setError("Enter the client site URL so the claims can be checked against the live pages."); return; }
    if (!mailText.trim() && !completionText.trim()) { setError("Add the commitment mail, the completion documents, or both."); return; }
    setRunning(true);
    const r: any = await post("wizard_verify_report", { projectId, siteUrl: siteUrl.trim(), clientContext, mailText, completionText });
    setRunning(false);
    if (!r?.success) { setError(r?.error || "Verification failed."); return; }
    setRes(r);
  };

  const openDoc = (title: string, md: string) => {
    const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] || c));
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>body{font:15px/1.65 -apple-system,system-ui,Segoe UI,sans-serif;color:#1a1a2e;max-width:900px;margin:40px auto;padding:0 22px;white-space:pre-wrap}table{border-collapse:collapse;width:100%;margin:12px 0}th,td{border:1px solid #e5e7eb;padding:7px 9px;text-align:left;font-size:13px;vertical-align:top}th{background:#f7f7fa}h1{font-size:23px}h2{font-size:17px;margin-top:26px;border-bottom:1px solid #ececf2;padding-bottom:6px}</style></head><body>${esc(md)}<p style="color:#6b6b80;margin-top:26px">Prepared by Manav S.</p></body></html>`;
    const tab = window.open("", "_blank");
    if (tab) { tab.document.write(html); tab.document.close(); }
  };

  const c = res?.counts || { total: 0, verified: 0, failed: 0, partial: 0, unverifiable: 0 };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <PortalNav />
      <div className="max-w-5xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-1">Work Report Check</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Verifies a delivery before it reaches the client: what sales committed, what the project manager reported, and what is actually live on the site right now. Search Console is used when connected and is never required.
        </p>

        <div className="rounded-2xl border border-border p-5 mb-5 space-y-4">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Client site URL</label>
            <input className="w-full mt-1 bg-muted/40 border border-border rounded-xl px-3 py-2 text-sm"
              placeholder="https://client.com/" value={siteUrl} onChange={(e) => setSiteUrl(e.target.value)} />
            {projectName ? <p className="text-[11px] text-muted-foreground mt-1">Active project: {projectName}. Search Console, when connected for this project, is read as supporting context.</p> : null}
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Client chat and call notes (persona, pain points, what they care about)</label>
            <textarea className="w-full mt-1 h-28 bg-muted/40 border border-border rounded-xl px-3 py-2 text-sm"
              placeholder="Paste the client conversation, call notes and the sales discussion. Used to build the client profile and to judge whether the delivered work speaks to their actual priorities."
              value={clientContext} onChange={(e) => setClientContext(e.target.value)} />
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Commitment mail (sales to project manager)</label>
            <textarea className="w-full mt-1 h-28 bg-muted/40 border border-border rounded-xl px-3 py-2 text-sm"
              placeholder="Paste the full mail that was passed to the PM. Every commitment in it becomes a line item that must be proven."
              value={mailText} onChange={(e) => setMailText(e.target.value)} />
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Work completion documents and sheets</label>
            <input type="file" multiple className="block w-full mt-1 text-xs text-muted-foreground file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border file:border-border file:bg-muted/40 file:text-xs"
              onChange={(e) => onFiles(e.target.files)} accept=".txt,.md,.csv,.tsv,.json,.html,.htm,.xml,.yaml,.yml,.log,.pdf,.docx,.xlsx,.xls" />
            {fileInfo ? <p className="text-[11px] text-muted-foreground mt-1">{fileInfo}</p> : null}
            <textarea className="w-full mt-2 h-28 bg-muted/40 border border-border rounded-xl px-3 py-2 text-sm"
              placeholder="Or paste the completion report here. Sheet contents from uploaded files appear here too, and can be edited before running."
              value={completionText} onChange={(e) => setCompletionText(e.target.value)} />
          </div>

          <div className="flex items-center gap-3">
            <button onClick={run} disabled={running}
              className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-60">
              {running ? "Checking every claim against the live site..." : "Run verification"}
            </button>
            {running ? <span className="text-xs text-muted-foreground">Each claimed item is fetched from the live page, so this takes a moment.</span> : null}
          </div>
          {error ? <p className="text-sm text-red-400">{error}</p> : null}
        </div>

        {res ? (
          <div className="space-y-5">
            <div className={`rounded-2xl border p-5 ${res.ready_to_submit ? "border-emerald-500/40 bg-emerald-500/10" : "border-amber-500/40 bg-amber-500/10"}`}>
              <div className="text-sm font-bold mb-1">{res.ready_to_submit ? "Ready to submit" : "Not ready to submit"}</div>
              <p className="text-sm text-foreground/90">{res.verdict}</p>
              <div className="flex flex-wrap gap-3 mt-3 text-xs">
                <span className="text-emerald-400">{c.verified} verified</span>
                <span className="text-amber-400">{c.partial} partial</span>
                <span className="text-red-400">{c.failed} failed</span>
                <span className="text-muted-foreground">{c.unverifiable} unverifiable</span>
                {res.pages_capped ? <span className="text-muted-foreground">(run capped, more items remain)</span> : null}
              </div>
              <div className="flex flex-wrap gap-2 mt-4">
                <button onClick={() => openDoc("Delivery verification", res.documents.internal_qa)} className="text-xs px-3 py-1.5 rounded-lg bg-primary/10 text-primary border border-primary/30">Open full QA report</button>
                <button onClick={() => openDoc("Fix list", res.documents.fix_list)} className="text-xs px-3 py-1.5 rounded-lg bg-primary/10 text-primary border border-primary/30">Open fix list for the PM</button>
                <button onClick={() => openDoc("Client summary", res.documents.client_summary)} className="text-xs px-3 py-1.5 rounded-lg bg-primary/10 text-primary border border-primary/30">Open client summary</button>
              </div>
            </div>

            <div className="rounded-2xl border border-border p-5">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Every claim against the live site</div>
              <div className="space-y-2">
                {(res.checks || []).map((k: any, i: number) => (
                  <div key={i} className="rounded-xl border border-border p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="text-sm font-semibold">{k.title || k.type}</div>
                      <span className={`text-[11px] px-2 py-0.5 rounded-full border whitespace-nowrap ${STATUS_STYLE[k.status] || STATUS_STYLE.unverifiable}`}>{k.status}</span>
                    </div>
                    {k.url ? <div className="text-[11px] text-muted-foreground mt-0.5 break-all">{k.url}</div> : null}
                    <div className="text-xs text-foreground/85 mt-1">{k.evidence}</div>
                    {k.expected ? <div className="text-[11px] text-muted-foreground mt-1">Committed: {k.expected}</div> : null}
                    {(k.quality || []).length ? <ul className="mt-1 space-y-0.5">{k.quality.map((q: string, j: number) => <li key={j} className="text-[11px] text-amber-400">{q}</li>)}</ul> : null}
                    {!k.claimed && k.committed ? <div className="text-[11px] text-amber-400 mt-1">Committed in the mail but not reported as completed.</div> : null}
                  </div>
                ))}
              </div>
            </div>

            {(res.quantity || []).length ? (
              <div className="rounded-2xl border border-border p-5">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Promised counts</div>
                {res.quantity.map((q: any, i: number) => (
                  <div key={i} className="text-xs mb-1">
                    <span className="font-semibold">{q.title}</span>: committed {q.committed}, reported {q.claimed}, confirmed live {q.verified}. <span className="text-muted-foreground">{q.note}</span>
                  </div>
                ))}
              </div>
            ) : null}

            {(res.missing || []).length || (res.extra || []).length ? (
              <div className="rounded-2xl border border-border p-5">
                {(res.missing || []).length ? (
                  <>
                    <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Committed but not reported</div>
                    <ul className="mb-3 space-y-1">{res.missing.map((m: any, i: number) => <li key={i} className="text-xs text-amber-400">{m.title}</li>)}</ul>
                  </>
                ) : null}
                {(res.extra || []).length ? (
                  <>
                    <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Reported but not committed</div>
                    <ul className="space-y-1">{res.extra.map((m: any, i: number) => <li key={i} className="text-xs text-muted-foreground">{m.title}</li>)}</ul>
                  </>
                ) : null}
              </div>
            ) : null}

            {(res.quality_issues || []).length ? (
              <div className="rounded-2xl border border-border p-5">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Quality issues found on the live pages</div>
                <ul className="space-y-1">{res.quality_issues.map((q: string, i: number) => <li key={i} className="text-xs text-amber-400">{q}</li>)}</ul>
              </div>
            ) : null}

            <div className="rounded-2xl border border-border p-5">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Search Console</div>
              <p className="text-xs text-foreground/85">{res.gsc?.note}</p>
              {(res.gsc?.rows || []).length ? (
                <table className="w-full mt-2 text-xs">
                  <thead><tr className="text-muted-foreground"><th className="text-left py-1">Query</th><th className="text-left">Clicks</th><th className="text-left">Impressions</th><th className="text-left">Position</th></tr></thead>
                  <tbody>{res.gsc.rows.map((r: any, i: number) => (
                    <tr key={i} className="border-t border-border"><td className="py-1">{r.query}</td><td>{r.clicks}</td><td>{r.impressions}</td><td>{Number(r.position).toFixed(1)}</td></tr>
                  ))}</tbody>
                </table>
              ) : null}
            </div>

            {res.client_alignment ? (
              <div className="rounded-2xl border border-border p-5">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Against what the client cares about</div>
                <p className="text-sm text-foreground/90 whitespace-pre-wrap">{res.client_alignment}</p>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
