import { useState, useEffect } from "react";
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
const GSC_DEP = new Set(["gsc_metrics_per_url", "gsc_query_page_pairs", "site_wide_url_classification", "url_inventory_export", "keyword_cannibalization", "topical_authority_map", "paid_organic_substitution"]);
const isGscDependent = (s: any) => (s?.capabilities || []).some((c: any) => GSC_DEP.has(c.id));
const isConnectStage = (s: any) => (s?.capabilities || []).some((c: any) => c.id === "gsc_metrics_per_url" || c.id === "gsc_query_page_pairs");

export default function Wizard() {
  const proj = useProject() as any;
  const projectId = proj?.selectedProjectId || (typeof localStorage !== "undefined" ? localStorage.getItem("seo_season_proj") : "") || "";
  const projectName = proj?.selectedProject?.name || "";
  const projectUrl = proj?.selectedProject?.url || "";

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
  const [projectConfirmed, setProjectConfirmed] = useState(false);
  const [noGsc, setNoGsc]             = useState(false);
  const [clientSiteUrl, setClientSiteUrl] = useState("");
  const [semrushKey, setSemrushKey] = useState("");
  const [savingSemrush, setSavingSemrush] = useState(false);
  const [semrushInfo, setSemrushInfo] = useState("");
  const [ingestingSheet, setIngestingSheet] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);
  const [reportAuthor, setReportAuthor] = useState("Manav S");
  const [includeBranding, setIncludeBranding] = useState(false);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [docMode, setDocMode] = useState<"audit" | "proposal">("audit");
  const [docScope, setDocScope] = useState<"smart" | "detailed" | "full">("smart");
  const [docSaved, setDocSaved] = useState("");
  const [crawlJob, setCrawlJob] = useState<{ id: string; done: number; total: number; complete: boolean } | null>(null);
  const [crawling, setCrawling] = useState(false);
  const [docEmphasis, setDocEmphasis] = useState("");
  const [generatingDoc, setGeneratingDoc] = useState(false);
  const [ingestingMaterials, setIngestingMaterials] = useState(false);
  const [analyzingDocs, setAnalyzingDocs] = useState(false);
  const [materialsInfo, setMaterialsInfo] = useState("");
  const [pasteNotes, setPasteNotes] = useState("");

  /* Restore in-progress inputs after a project-switch reload. */
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("wizard_restore");
      if (raw) { const s = JSON.parse(raw); if (s.chatText) setChatText(s.chatText); if (s.noGsc) setNoGsc(true); if (s.clientSiteUrl) setClientSiteUrl(s.clientSiteUrl); if (s.keywords) setKeywords(s.keywords); if (s.competitors) setCompetitors(s.competitors); sessionStorage.removeItem("wizard_restore"); }
    } catch { /* ignore */ }
    /* Prefill from a deal's "Build demo" link: /wizard?client=domain */
    try {
      const cd = new URLSearchParams(window.location.search).get("client");
      if (cd) { const dom = cd.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, ""); if (dom) { setClientSiteUrl(`https://${dom}/`); setNoGsc(true); } }
    } catch { /* ignore */ }
  }, []);

  /* Auto-fill empty fields from what the brief already told us. */
  useEffect(() => {
    if (!plan) return;
    if (plan.client_domain && !clientSiteUrl.trim()) setClientSiteUrl(`https://${plan.client_domain}/`);
    if (Array.isArray(plan.suggested_keywords) && plan.suggested_keywords.length && !keywords.trim()) setKeywords(plan.suggested_keywords.join(", "));
    if (Array.isArray(plan.competitor_domains) && plan.competitor_domains.length && !competitors.trim()) setCompetitors(plan.competitor_domains.join(", "));
    if (plan.artifact_mode === "proposal" || plan.artifact_mode === "audit") setDocMode(plan.artifact_mode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan]);

  const createProjectForClient = async () => {
    if (!plan?.client_domain) { setError("No client domain detected in the brief to create a project from."); return; }
    setCreatingProject(true); setError("");
    let userId = "";
    try { const { supabase } = await import("@/lib/supabase"); const { data } = await supabase.auth.getUser(); userId = (data as any)?.user?.id || ""; } catch { /* ignore */ }
    const r: any = await post("wizard_create_project", { name: plan.client_domain, domain: plan.client_domain, userId });
    setCreatingProject(false);
    if (!r?.projectId) { setError(r?.error || "Could not create the project."); return; }
    try {
      sessionStorage.setItem("wizard_restore", JSON.stringify({ chatText, noGsc: true, clientSiteUrl: clientSiteUrl || `https://${plan.client_domain}/`, keywords, competitors }));
      localStorage.setItem("seo_season_proj", r.projectId);
    } catch { /* ignore */ }
    window.location.reload();
  };

  const classify = async () => {
    if (!chatText.trim()) return;
    setClassifying(true); setError(""); setPlan(null); setResults({}); setProjectConfirmed(false);
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
    if (clientSiteUrl.trim()) inputs.siteUrl = clientSiteUrl.trim();
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
    setProjectConfirmed(true);
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
      setProjectConfirmed(true);
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

  const renderToTab = (html: string, tab: Window | null, fallbackName: string) => {
    if (tab && !tab.closed) { tab.document.open(); tab.document.write(html); tab.document.close(); }
    else { downloadHtml(html, fallbackName); }  // popup blocked → fall back to download
  };

  const uploadSemrushSheet = async (file: File | undefined) => {
    if (!file) return;
    if (!projectId) { setError("No active project found."); return; }
    setIngestingSheet(true); setError("");
    try {
      const text = await file.text();
      const r: any = await post("semrush_ingest_sheet", { projectId, csvText: text, clientDomain: plan?.client_domain, competitors: competitors.split(",").map(c => c.trim()).filter(Boolean) });
      setIngestingSheet(false);
      setSemrushInfo(r?.success ? `Semrush data ingested for ${r.client || "the client"}${r.competitors ? ` + ${r.competitors} competitor(s)` : ""}. The authority/backlink/keyword stage will use these numbers.` : (r?.error || "Could not read the sheet."));
    } catch (e: any) { setIngestingSheet(false); setError(e?.message || "Could not read the file."); }
  };

  const saveSemrush = async () => {
    if (!projectId) { setError("No active project found."); return; }
    if (!semrushKey.trim()) return;
    setSavingSemrush(true); setError("");
    const r: any = await post("semrush_save_key", { projectId, apiKey: semrushKey.trim() });
    setSavingSemrush(false);
    setSemrushInfo(r?.success ? "Semrush key saved — authority/backlink/keyword stages can now run." : (r?.error || "Could not save key."));
    if (r?.success) setSemrushKey("");
  };

  const ingestMaterials = async (files: Array<{ filename: string; text: string }>) => {
    if (!projectId) { setError("No active project found."); return; }
    if (!files.length) return;
    const CHUNK = 600000; // keep each request body well under the serverless limit
    /* Split large files into parts, then batch parts so each POST stays small. */
    const parts: Array<{ filename: string; text: string }> = [];
    for (const f of files) {
      if (f.text.length <= CHUNK) parts.push(f);
      else { let i = 0, n = 1; while (i < f.text.length) { parts.push({ filename: `${f.filename} (part ${n})`, text: f.text.slice(i, i + CHUNK) }); i += CHUNK; n++; } }
    }
    const batches: Array<Array<{ filename: string; text: string }>> = [];
    let cur: Array<{ filename: string; text: string }> = []; let curLen = 0;
    for (const p of parts) { if (curLen + p.text.length > CHUNK && cur.length) { batches.push(cur); cur = []; curLen = 0; } cur.push(p); curLen += p.text.length; }
    if (cur.length) batches.push(cur);

    setIngestingMaterials(true); setError("");
    let stored = 0, total = 0; let skipped: string[] = [];
    for (let b = 0; b < batches.length; b++) {
      const r: any = await post("wizard_ingest_materials", { projectId, files: batches[b] });
      if (!r?.stored && !r?.success) { setIngestingMaterials(false); setError(r?.error || "Materials ingestion failed."); if (r?.skipped?.length) setMaterialsInfo(`Skipped: ${r.skipped.join(", ")}`); return; }
      stored = r.stored ?? stored; total = r.total_chars ?? total; if (Array.isArray(r.skipped)) skipped = r.skipped;
      setMaterialsInfo(`Uploading… ${b + 1}/${batches.length}`);
    }
    setIngestingMaterials(false);
    setMaterialsInfo(`${stored} item(s) stored (${Math.round(total / 1000)}k chars).${skipped.length ? ` Skipped: ${skipped.join(", ")}` : ""}`);
  };
  const onMaterialFiles = async (fileList: FileList | null) => {
    const TEXT_EXT = /\.(txt|md|markdown|csv|tsv|json|html?|log|xml|yaml|yml)$/i;
    /* Browser-side extraction for common binary docs — parsers loaded from CDN
       only when needed (no bundle bloat). The extracted text then feeds the same
       materials path, so no server-side file handling is required. */
    const extractPdf = async (f: File): Promise<string> => {
      const pdfUrl = "https://esm.sh/pdfjs-dist@4.0.379/build/pdf.min.mjs";
      const pdfjs: any = await import(/* @vite-ignore */ pdfUrl);
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
      const mammothUrl = "https://esm.sh/mammoth@1.6.0";
      const mammoth: any = await import(/* @vite-ignore */ mammothUrl);
      const res = await mammoth.extractRawText({ arrayBuffer: await f.arrayBuffer() });
      return String(res?.value || "").trim();
    };
    const extractPptx = async (f: File): Promise<string> => {
      const zipUrl = "https://esm.sh/jszip@3.10.1";
      const JSZip: any = (await import(/* @vite-ignore */ zipUrl)).default;
      const zip = await JSZip.loadAsync(await f.arrayBuffer());
      const readTxt = async (n: string) => Array.from((await zip.files[n].async("string")).matchAll(/<a:t>([^<]*)<\/a:t>/g)).map((m: any) => m[1]).join(" ").replace(/\s+/g, " ").trim();
      let out = "";
      /* 1. Slide text. */
      const slideNames = Object.keys(zip.files).filter((n: string) => /ppt\/slides\/slide\d+\.xml$/.test(n)).sort();
      let slides = "";
      for (const n of slideNames) { const t = await readTxt(n); if (t) slides += `[${n.split("/").pop()}] ${t}\n`; }
      if (slides.trim()) out += `=== Slide text ===\n${slides}\n`;
      /* 2. Speaker notes. */
      const noteNames = Object.keys(zip.files).filter((n: string) => /ppt\/notesSlides\/notesSlide\d+\.xml$/.test(n)).sort();
      let notes = "";
      for (const n of noteNames) { const t = await readTxt(n); if (t) notes += `[${n.split("/").pop()}] ${t}\n`; }
      if (notes.trim()) out += `=== Speaker notes ===\n${notes}\n`;
      /* 3. OCR — read the text inside embedded images (screenshots of tables,
         charts exported as PNGs, text baked into graphics). Real pixels to text. */
      const imgNames = Object.keys(zip.files).filter((n: string) => /ppt\/media\/[^/]+\.(png|jpe?g|bmp|gif|webp)$/i.test(n)).sort().slice(0, 20);
      if (imgNames.length) {
        try {
          setMaterialsInfo(`Reading text inside ${imgNames.length} image(s) (OCR)…`);
          const tUrl = "https://esm.sh/tesseract.js@5.1.0";
          const Tesseract: any = await import(/* @vite-ignore */ tUrl);
          let ocr = ""; let done = 0;
          for (const n of imgNames) {
            try {
              const blob = await zip.files[n].async("blob");
              const url = URL.createObjectURL(blob);
              const res = await Tesseract.recognize(url, "eng");
              URL.revokeObjectURL(url);
              const txt = String(res?.data?.text || "").replace(/\s+/g, " ").trim();
              if (txt.length > 3) ocr += `[${n.split("/").pop()}] ${txt}\n`;
            } catch { /* skip this image */ }
            done++; setMaterialsInfo(`Reading text inside images (OCR)… ${done}/${imgNames.length}`);
          }
          if (ocr.trim()) out += `=== Text read from images (OCR — verify, may misread) ===\n${ocr}\n`;
        } catch { /* OCR engine unavailable — slide text and notes still returned */ }
      }
      return out.trim();
    };
    const extractImage = async (f: File): Promise<string> => {
      const tUrl = "https://esm.sh/tesseract.js@5.1.0";
      const Tesseract: any = await import(/* @vite-ignore */ tUrl);
      const url = URL.createObjectURL(f);
      const res = await Tesseract.recognize(url, "eng");
      URL.revokeObjectURL(url);
      return String(res?.data?.text || "").replace(/\s+/g, " ").trim();
    };
    const extractXlsx = async (f: File): Promise<string> => {
      const xlsxUrl = "https://esm.sh/xlsx@0.18.5";
      const XLSX: any = await import(/* @vite-ignore */ xlsxUrl);
      const wb = XLSX.read(new Uint8Array(await f.arrayBuffer()), { type: "array" });
      let out = "";
      for (const name of (wb.SheetNames || [])) {
        try { const csv = XLSX.utils.sheet_to_csv(wb.Sheets[name]); if (csv && csv.trim()) out += `=== Sheet: ${name} ===\n${csv.trim()}\n\n`; } catch { /* skip sheet */ }
      }
      return out.trim();
    };

    const arr = Array.from(fileList || []);
    const files: Array<{ filename: string; text: string }> = [];
    const skipped: string[] = [];
    if (arr.some(f => /\.(pdf|docx|pptx|xlsx?|png|jpe?g|bmp|gif|webp)$/i.test(f.name))) setMaterialsInfo("Reading files…");
    for (const f of arr) {
      try {
        let text = "";
        if (TEXT_EXT.test(f.name)) text = await f.text();
        else if (/\.pdf$/i.test(f.name)) text = await extractPdf(f);
        else if (/\.docx$/i.test(f.name)) text = await extractDocx(f);
        else if (/\.pptx$/i.test(f.name)) text = await extractPptx(f);
        else if (/\.xlsx?$/i.test(f.name)) { setMaterialsInfo(`Reading all sheets from ${f.name}…`); text = await extractXlsx(f); }
        else if (/\.(png|jpe?g|bmp|gif|webp)$/i.test(f.name)) { setMaterialsInfo(`Reading text from ${f.name} (OCR)…`); text = await extractImage(f); }
        else { skipped.push(`${f.name} (unsupported — paste its text)`); continue; }
        if (text && text.trim().length > 3) files.push({ filename: f.name, text });
        else skipped.push(`${f.name} (no extractable text${/\.(pdf|png|jpe?g)$/i.test(f.name) ? " — may be blank or an image with no readable text" : ""})`);
      } catch { skipped.push(`${f.name} (could not read — paste its text)`); }
    }
    if (files.length) await ingestMaterials(files);
    if (skipped.length && !files.length) setMaterialsInfo(`Skipped: ${skipped.join(", ")}`);
  };

  const analyzeDocs = async () => {
    if (!projectId) { setError("No active project found."); return; }
    const reqs = (plan?.stages || []).map((s: any) => s.label);
    setAnalyzingDocs(true); setError("");
    const r: any = await post("wizard_analyze_documents", { projectId, requirements: reqs, clientName: plan?.client_domain });
    if (!r?.report) { setAnalyzingDocs(false); setError(r?.error || "Document analysis failed."); return; }
    setResults(prev => ({ ...prev, document_analysis: { status: r.report.has_materials && r.report.requirement_findings?.length ? "completed" : "needs_input", ran_engine: "document-intelligence.ts", validation: "unvalidated", output: r.report, note: r.report.summary } }));
    /* Fold the client's document into the brief: re-compose the plan WITH the
       stored materials so the stages regenerate to reflect what the document adds. */
    let activePlan = plan;
    if (r.report?.has_materials && chatText.trim()) {
      setMaterialsInfo("Folding the document into the brief and updating the stages…");
      const rp: any = await post("wizard_compose", { chatText: chatText.trim(), projectId });
      if (rp?.success && rp?.plan) { activePlan = rp.plan; setPlan(rp.plan); setMaterialsInfo(`Stages updated from your document${Array.isArray(rp.material_files) && rp.material_files.length ? ` (${rp.material_files.join(", ")})` : ""}.`); }
    }
    /* Satisfy stages your DATA covers: map each document finding to its stage so
       a GSC-dependent stage your upload answers is marked "covered by your data"
       instead of staying deferred. Verifiable — the source file is cited. */
    const rf: any[] = Array.isArray(r.report?.requirement_findings) ? r.report.requirement_findings : [];
    if (rf.length && activePlan?.stages?.length) {
      const norm = (x: any) => String(x || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      const byLabel = new Map((activePlan.stages || []).map((s: any) => [norm(s.label), s]));
      setResults(prev => {
        const next: Record<string, any> = { ...prev };
        for (const f of rf) {
          if (!(f?.findings?.length || f?.data_points?.length)) continue;
          const stage: any = byLabel.get(norm(f.requirement));
          if (stage && (!next[stage.id] || next[stage.id].status !== "completed" || next[stage.id].ran_engine === "document-intelligence.ts")) {
            next[stage.id] = { status: "completed", ran_engine: "document-intelligence.ts", validation: "unvalidated",
              output: { from_documents: true, requirement: f.requirement, findings: f.findings || [], data_points: f.data_points || [], source_files: f.source_files || [], summary: [...(f.findings || []), ...(f.data_points || [])].join(" ") },
              note: `Covered by your uploaded data${(f.source_files || []).length ? ` (${f.source_files.join(", ")})` : ""} — verify against the source.` };
          }
        }
        return next;
      });
    }
    setAnalyzingDocs(false);
  };

  const generateReport = async () => {
    const stagesIn = (plan?.stages || [])
      .map((s: any) => { const r = results[s.id]; return r && r.status === "completed" ? { label: s.label, ran_engine: r.ran_engine, status: r.status, output: r.output } : null; })
      .filter(Boolean);
    const docRes: any = results["document_analysis"];
    if (docRes && docRes.status === "completed") stagesIn.unshift({ label: "Analysis from your uploaded documents", ran_engine: docRes.ran_engine, status: "completed", output: docRes.output });
    if (stagesIn.length === 0) { setError("Run at least one stage (or analyse your documents) before generating the client report."); return; }
    const tab = window.open("", "_blank");
    if (tab) tab.document.write('<!doctype html><meta charset="utf-8"><body style="font-family:system-ui,sans-serif;padding:28px;color:#555">Generating report…</body>');
    setGeneratingReport(true); setError("");
    const r: any = await post("wizard_report", { stages: stagesIn, projectId, requirements: (plan?.stages || []).map((s: any) => s.label), author: reportAuthor, clientName: plan?.client_domain, clientDomain: plan?.client_domain, includeBranding, artifactMode: plan?.artifact_mode, engagementType: plan?.engagement_type, targetIsExample: plan?.target_is_example, buyerNote: plan?.buyer_note });
    setGeneratingReport(false);
    if (!r?.html) { if (tab && !tab.closed) tab.close(); setError(r?.error || "Report generation failed."); return; }
    renderToTab(r.html, tab, `audit-${(plan?.client_domain || "client").replace(/[^a-z0-9.-]+/gi, "_")}.html`);
  };

  const startOrContinueCrawl = async () => {
    const siteUrl = (clientSiteUrl && clientSiteUrl.trim()) || (plan?.client_domain ? `https://${plan.client_domain}/` : "");
    if (!siteUrl) { setError("Add the client site URL first."); return; }
    setCrawling(true); setError("");
    const r: any = await post("wizard_crawl_batch", crawlJob ? { jobId: crawlJob.id, projectId } : { siteUrl, projectId, mode: docScope });
    setCrawling(false);
    if (!r?.success) { setError(r?.error || "Crawl failed."); return; }
    setCrawlJob({ id: r.jobId, done: r.done, total: r.total, complete: !!r.complete });
  };

  const generateClientDocument = async () => {
    const siteUrl = (clientSiteUrl && clientSiteUrl.trim()) || (plan?.client_domain ? `https://${plan.client_domain}/` : "");
    if (!siteUrl) { setError("Add the client site URL above first — the document is built from a live crawl of it."); return; }
    const tab = window.open("", "_blank");
    if (tab) tab.document.write('<!doctype html><meta charset="utf-8"><body style="font-family:system-ui,sans-serif;padding:28px;color:#555">Running the full site analysis and assembling the document — this crawls the site, audits schema and checks search visibility, so it takes a little longer…</body>');
    setGeneratingDoc(true); setError(""); setDocSaved("");
    const r: any = await post("wizard_client_document", { siteUrl, projectId, author: reportAuthor, clientDomain: plan?.client_domain, includeBranding, requirements: (plan?.stages || []).map((s: any) => s.label), artifactMode: docMode, engagementType: plan?.engagement_type, targetIsExample: plan?.target_is_example, buyerNote: plan?.buyer_note, operatorEmphasis: docEmphasis.trim() || undefined, mode: docScope, jobId: (crawlJob && crawlJob.complete) ? crawlJob.id : undefined });
    setGeneratingDoc(false);
    if (!r?.html) { if (tab && !tab.closed) tab.close(); setError(r?.error || "Document generation failed."); return; }
    if (r.saved) setDocSaved("Saved under this project — you can reopen it without re-running.");
    const mf = Array.isArray(r.materials_found) ? r.materials_found : [];
    if (mf.length) setDocSaved(prev => `${prev ? prev + " " : ""}Used your uploaded data: ${mf.map((m: any) => m.filename).join(", ")}.`);
    else setDocSaved(prev => `${prev ? prev + " " : ""}Note: no uploaded materials were found under this project — if your CSV is not being used, it was likely uploaded under a different project. Upload it under this one and regenerate.`);
    renderToTab(r.html, tab, `${docMode}-${(plan?.client_domain || "client").replace(/[^a-z0-9.-]+/gi, "_")}.html`);
  };

  const downloadHtml = (html: string, filename: string) => {
    const blob = new Blob([html], { type: "text/html" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  /* Formatted per-stage report — opens in a new tab. */
  const openStageReport = async (s: any, result: any) => {
    if (!result?.output) return;
    const tab = window.open("", "_blank");
    if (tab) tab.document.write('<!doctype html><meta charset="utf-8"><body style="font-family:system-ui,sans-serif;padding:28px;color:#555">Generating report…</body>');
    const r: any = await post("wizard_report", { stages: [{ label: s.label, ran_engine: result.ran_engine, status: result.status, output: result.output }], projectId, author: reportAuthor, clientName: plan?.client_domain, clientDomain: plan?.client_domain, includeBranding });
    if (!r?.html) { if (tab && !tab.closed) tab.close(); setError(r?.error || "Report generation failed."); return; }
    renderToTab(r.html, tab, `${s.id || "stage"}-report.html`);
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
              <div className="mt-2">
                {(() => {
                  const cd = plan.client_domain ? cleanDomain(plan.client_domain) : "";
                  const pd = projectUrl ? cleanDomain(projectUrl) : "";
                  const matches = cd && pd && cd === pd;
                  if (projectConfirmed || matches) {
                    return <span className="text-xs px-2 py-1 rounded-md border" style={chip("#10b981")}>✓ Analysing {projectName || cd || "the active project"}</span>;
                  }
                  return (
                    <div className="flex flex-wrap items-center gap-2">
                      {cd && (
                        <button onClick={createProjectForClient} disabled={creatingProject}
                          className="text-xs px-3 py-1.5 rounded-lg font-semibold border" style={chip("#10b981")}>
                          {creatingProject ? "Creating…" : `Create a project for ${cd} and switch`}
                        </button>
                      )}
                      <button onClick={() => setProjectConfirmed(true)}
                        className="text-xs px-3 py-1.5 rounded-lg font-semibold border" style={chip("#f59e0b")}>
                        The active project already is {cd || "this client"} — continue
                      </button>
                    </div>
                  );
                })()}
                {plan.client_domain && projectUrl && cleanDomain(projectUrl) !== cleanDomain(plan.client_domain) && !projectConfirmed && (
                  <p className="text-[11px] mt-1" style={{ color: "#ef4444" }}>The active project is {cleanDomain(projectUrl)}, but the brief is about {cleanDomain(plan.client_domain)}. Create the correct project to avoid analysing the wrong site.</p>
                )}
              </div>
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
              <div className="text-xs font-semibold text-muted-foreground mt-3 mb-2 uppercase tracking-wider">Semrush API key (for authority, backlinks &amp; keyword data)</div>
              <div className="flex flex-wrap items-center gap-2">
                <input type="password"
                  className="flex-1 min-w-[200px] px-4 py-2.5 rounded-xl border border-border bg-background text-sm outline-none focus:border-primary"
                  placeholder="Semrush API key (uses your Semrush API units)"
                  value={semrushKey} onChange={e => setSemrushKey(e.target.value)} />
                <button onClick={saveSemrush} disabled={savingSemrush || !semrushKey.trim()}
                  className="text-xs px-3 py-2 rounded-lg bg-primary/10 text-primary border border-primary/30 hover:bg-primary/20 disabled:opacity-50">
                  {savingSemrush ? "Saving…" : "Save key"}
                </button>
                <label className="text-xs px-3 py-2 rounded-lg bg-primary/10 text-primary border border-primary/30 hover:bg-primary/20 cursor-pointer">
                  {ingestingSheet ? "Reading sheet…" : "Upload Semrush data sheet"}
                  <input type="file" accept=".csv,.tsv,.txt" className="hidden" onChange={e => uploadSemrushSheet(e.target.files?.[0])} disabled={ingestingSheet} />
                </label>
              </div>
              {semrushInfo && <p className="text-[11px] text-muted-foreground mt-1">{semrushInfo}</p>}
              <p className="text-[11px] text-muted-foreground/70 mt-1">Optional. No tool is required — you can instead upload an export from any tool (Ahrefs, Moz, Semrush, Screaming Frog, GA) in the materials step below, and the report will use it for the same data. Where a need has no source, the report states it honestly and names the best source to fill it.</p>
              <label className="flex items-center gap-2 text-xs text-muted-foreground mt-4">
                <input type="checkbox" checked={noGsc} onChange={e => setNoGsc(e.target.checked)} />
                I do not have the client's Search Console yet (prospect mode)
              </label>
              {noGsc && (
                <div className="mt-2">
                  <div className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">Client site URL (for crawl / SERP / PSI stages — no GSC needed)</div>
                  <input
                    className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-sm outline-none focus:border-primary"
                    placeholder="https://clientsite.com"
                    value={clientSiteUrl} onChange={e => setClientSiteUrl(e.target.value)} />
                  <p className="text-[11px] text-muted-foreground/70 mt-1">GSC-dependent stages will be deferred. Stages that run on live crawl, search results, and PageSpeed will run against this URL with real data.</p>
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-border bg-card p-5 mb-6">
              <div className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">Your materials &amp; client files (deepen the report with real data)</div>
              <p className="text-xs text-muted-foreground mb-3">Upload your own analysis, the client's files, or exports — text, markdown, CSV, Excel (.xlsx, every sheet), JSON, HTML, PDF, Word (.docx), PowerPoint (.pptx) and images. Excel workbooks are read sheet by sheet (so multi-tab data is kept in full, unlike a single-sheet CSV); PPTX and images are read with OCR. The report engine uses all of it — alongside the live crawl/SERP/PageSpeed data — to answer each brief point, even without GSC.</p>
              <div className="flex flex-wrap items-center gap-3 mb-3">
                <label className="text-xs px-3 py-1.5 rounded-lg bg-primary/10 text-primary border border-primary/30 hover:bg-primary/20 cursor-pointer">
                  {ingestingMaterials ? "Ingesting…" : "Upload files"}
                  <input type="file" multiple accept=".txt,.md,.markdown,.csv,.tsv,.json,.html,.htm,.log,.xml,.yaml,.yml,.pdf,.docx,.pptx,.xlsx,.xls,.png,.jpg,.jpeg,.webp,.bmp,.gif" className="hidden"
                    onChange={e => onMaterialFiles(e.target.files)} disabled={ingestingMaterials} />
                </label>
                {materialsInfo && <span className="text-[11px] text-muted-foreground">{materialsInfo}</span>}
              </div>
              <textarea
                className="w-full h-24 px-4 py-2.5 rounded-xl border border-border bg-background text-sm outline-none focus:border-primary resize-y"
                placeholder="Or paste your notes / analysis / findings here…"
                value={pasteNotes} onChange={e => setPasteNotes(e.target.value)} />
              <button onClick={() => { if (pasteNotes.trim()) { ingestMaterials([{ filename: "pasted-notes.txt", text: pasteNotes.trim() }]); setPasteNotes(""); } }}
                disabled={ingestingMaterials || !pasteNotes.trim()}
                className="mt-2 text-xs px-3 py-1.5 rounded-lg bg-primary/10 text-primary border border-primary/30 hover:bg-primary/20 disabled:opacity-50">
                Add pasted notes
              </button>

              <div className="mt-4 pt-3 border-t border-border">
                <p className="text-xs text-muted-foreground mb-2">Read your uploaded documents and extract findings for every requirement in the brief — grounded in your real material, with the source file cited. This is how your work feeds the report (and the substance path when there is no GSC).</p>
                <button onClick={analyzeDocs} disabled={analyzingDocs}
                  className="text-xs px-4 py-2 rounded-xl bg-primary text-primary-foreground font-semibold hover:opacity-90 disabled:opacity-50">
                  {analyzingDocs ? "Reading documents…" : "Analyse my documents against the brief"}
                </button>
                {results["document_analysis"] && (
                  <div className="mt-3 pt-3 border-t border-border">
                    <span className="inline-block text-[11px] px-2 py-0.5 rounded-md mb-2 border" style={chip("#f59e0b")}>Unvalidated — from your documents; review</span>
                    <p className="text-xs text-muted-foreground mb-2">{results["document_analysis"].note}</p>
                    {(results["document_analysis"].output?.requirement_findings || []).map((rf: any, i: number) => (
                      <div key={i} className="mb-2">
                        <p className="text-xs font-semibold">{rf.requirement}</p>
                        {rf.findings?.length > 0 && <ul className="list-disc ml-5 text-xs text-muted-foreground">{rf.findings.map((f: string, j: number) => <li key={j}>{f}</li>)}</ul>}
                        {rf.source_files?.length > 0 && <p className="text-[11px] text-muted-foreground/70">From: {rf.source_files.join(", ")}</p>}
                      </div>
                    ))}
                    {results["document_analysis"].output?.uncovered?.length > 0 && (
                      <p className="text-[11px] text-muted-foreground/70 mt-1">Not in your documents (need live analysis or GSC): {results["document_analysis"].output.uncovered.join("; ")}</p>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-3">
              {plan.stages?.map((s: any, i: number) => {
                const rd = READINESS[s.readiness] || { label: s.readiness, color: "#94a3b8" };
                const res = results[s.id];
                const st = res ? (STATUS[res.status] || { label: res.status, color: "#94a3b8" }) : null;
                const connectStage = isConnectStage(s);
                /* Offer connect tools on a connect stage until it has completed. */
                const showConnect = connectStage && (!res || res.status === "needs_connection");
                const deferred = noGsc && isGscDependent(s) && !(res && res.status === "completed");
                const gateOk = projectConfirmed || (noGsc && clientSiteUrl.trim().length > 3) || (!!plan.client_domain && !!projectUrl && cleanDomain(projectUrl) === cleanDomain(plan.client_domain));
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
                      <button onClick={() => runStage(s)} disabled={running === s.id || s.readiness === "blocked" || s.is_gap || deferred || !gateOk}
                        className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 disabled:opacity-50 whitespace-nowrap">
                        {running === s.id ? "Running…" : s.is_gap ? "No engine" : s.readiness === "blocked" ? "Blocked" : deferred ? "Deferred (needs GSC)" : !gateOk ? "Confirm project ↑" : res ? "Re-run" : "Run stage"}
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
                          <div className="flex items-center gap-3">
                            <button onClick={() => openStageReport(s, res)}
                              className="text-xs px-3 py-1.5 rounded-lg bg-primary/10 text-primary border border-primary/30 hover:bg-primary/20">
                              ↗ Open report
                            </button>
                            <button onClick={() => downloadReport(s, res)}
                              className="text-[11px] text-muted-foreground/70 underline hover:text-muted-foreground">
                              raw data (JSON)
                            </button>
                          </div>
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

            {/* World-class client document — runs the full no-integration analysis itself */}
            <div className="rounded-2xl border-2 border-primary/30 bg-primary/5 p-5 mt-6">
              <div className="text-xs font-semibold text-primary mb-2 uppercase tracking-wider">Client / investor document — full analysis, no integration needed</div>
              <p className="text-xs text-muted-foreground mb-3">Builds a complete, senior-DMS document from a live crawl of the site: site-wide on-page and technical audit, structured-data (schema) audit and generation, and search / AI-answer visibility. No GSC or other connection required. States plainly what a GSC connection would add. Opens print-ready in a new tab (Print → Save as PDF).</p>
              <label className="block text-[11px] font-medium text-muted-foreground mb-1">Your context / what to emphasise (optional — set your angle before running)</label>
              <textarea value={docEmphasis} onChange={(e) => setDocEmphasis(e.target.value)} rows={2}
                placeholder="e.g. We sell content, AEO and link-building — not speed fixes. Emphasise the AI-visibility and schema gaps. The buyer is a reseller who cares about repeatable quality at scale."
                className="w-full mb-3 rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/60 resize-y" />
              <div className="flex flex-wrap items-center gap-3 mb-3">
                <div className="inline-flex rounded-lg border border-border overflow-hidden text-sm">
                  <button onClick={() => setDocMode("audit")} className={`px-4 py-1.5 ${docMode === "audit" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground"}`}>Audit</button>
                  <button onClick={() => setDocMode("proposal")} className={`px-4 py-1.5 ${docMode === "proposal" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground"}`}>Proposal</button>
                </div>
                <span className="text-[11px] text-muted-foreground">{docMode === "proposal" ? "Scope, delivery method, quality standards and pricing basis — for a productized / reseller / retainer brief." : "Findings and recommendations — a diagnosis of the site."}</span>
              </div>
              <div className="flex flex-wrap items-center gap-3 mb-3">
                <span className="text-[11px] font-medium text-muted-foreground">Depth:</span>
                <div className="inline-flex rounded-lg border border-border overflow-hidden text-sm">
                  <button onClick={() => { setDocScope("smart"); setCrawlJob(null); }} className={`px-4 py-1.5 ${docScope === "smart" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground"}`}>Smart</button>
                  <button onClick={() => { setDocScope("detailed"); setCrawlJob(null); }} className={`px-4 py-1.5 ${docScope === "detailed" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground"}`}>Detailed</button>
                  <button onClick={() => { setDocScope("full"); setCrawlJob(null); }} className={`px-4 py-1.5 ${docScope === "full" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground"}`}>Full</button>
                </div>
                <span className="text-[11px] text-muted-foreground">{docScope === "full" ? "The whole sitemap — every declared page." : docScope === "detailed" ? "The 100 most important pages." : "The ~25 most business-critical pages."}</span>
              </div>
              {docScope !== "smart" && (
                <div className="rounded-lg border border-border bg-background/50 p-3 mb-3">
                  <p className="text-[11px] text-muted-foreground mb-2">{docScope === "full" ? "Full" : "Detailed"} depth crawls every page with full rendering, in batches you approve — so it reaches the whole set without timing out. Run it before generating; the report then uses the complete crawl.</p>
                  {!crawlJob && <button onClick={startOrContinueCrawl} disabled={crawling} className="px-4 py-1.5 rounded-lg bg-secondary text-secondary-foreground text-xs font-semibold disabled:opacity-50">{crawling ? "Starting crawl…" : "Start batched crawl"}</button>}
                  {crawlJob && !crawlJob.complete && (
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-foreground">Crawled {crawlJob.done} of {crawlJob.total} pages</span>
                      <button onClick={startOrContinueCrawl} disabled={crawling} className="px-4 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-50">{crawling ? "Crawling…" : "Continue crawling"}</button>
                    </div>
                  )}
                  {crawlJob && crawlJob.complete && (crawlJob.total <= 2
                    ? <p className="text-[11px] text-amber-500">Only {crawlJob.done} page(s) were found — the sitemap was likely unreachable this run (rate-limiting or a WAF block, common on a repeat crawl). Wait a minute and click Start batched crawl again for full coverage.</p>
                    : <p className="text-[11px] text-emerald-500">Crawled all {crawlJob.done} pages — ready. Generate the document below and it will use this full crawl.</p>)}
                </div>
              )}
              {docSaved && <p className="text-[11px] text-emerald-500 mb-2">{docSaved}</p>}
              <button onClick={generateClientDocument} disabled={generatingDoc}
                className="px-6 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-50">
                {generatingDoc ? "Analysing the site & assembling…" : `Generate client ${docMode === "proposal" ? "proposal" : "audit"}`}
              </button>
            </div>

            {/* Client-ready report — assembled from completed stages, sourced and bylined */}
            {Object.values(results).some((r: any) => r?.status === "completed") && (
              <div className="rounded-2xl border border-border bg-card p-5 mt-6">
                <div className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wider">Client-ready report</div>
                <p className="text-xs text-muted-foreground mb-3">Opens the completed stages as one written, print-ready audit in a new tab (use Print → Save as PDF from there). Every section carries a senior-DMS read plus its true source, authored by the name below, no tool branding unless you opt in. Built only from real data that ran; the interpretation is the analyst's read and the data sits beneath it.</p>
                <p className="text-[11px] text-muted-foreground/70 mb-3">Each stage above also has its own "Open report" for a single section.</p>
                <div className="flex flex-wrap items-center gap-3 mb-3">
                  <label className="text-xs text-muted-foreground">Author
                    <input value={reportAuthor} onChange={e => setReportAuthor(e.target.value)}
                      className="ml-2 px-3 py-1.5 rounded-lg border border-border bg-background text-sm outline-none focus:border-primary" />
                  </label>
                  <label className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <input type="checkbox" checked={includeBranding} onChange={e => setIncludeBranding(e.target.checked)} />
                    Include tool branding
                  </label>
                </div>
                <button onClick={generateReport} disabled={generatingReport}
                  className="px-6 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-50">
                  {generatingReport ? "Assembling…" : "Open client report"}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
