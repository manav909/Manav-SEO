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
  const [docSuggestions, setDocSuggestions] = useState<any[]>([]);
  const [generatedDocs,  setGeneratedDocs]  = useState<Record<string,any>>({});
  const [generatingDoc,  setGeneratingDoc]  = useState<string|null>(null);
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

  const generateDoc = async (docId: string) => {
    if (!audit) { setError("Run an audit first"); return; }
    setGeneratingDoc(docId);
    setError("");
    try {
      const r = await post("generate_sales_documents", {
        auditResult: audit, url, salesContext, docType: docId,
      });
      if ((r as any).success && (r as any).data) {
        setGeneratedDocs((prev: any) => ({ ...prev, [docId]: r }));
      } else {
        setError((r as any).error || "Generation failed — check Vercel logs");
      }
    } catch (e: any) {
      setError("Network error: " + e.message);
    }
    setGeneratingDoc(null);
  };

  const renderDocHTML = (docId: string, data: any, siteUrl: string, auditScore: number): string => {
    const printCSS = "@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}@page{size:A4;margin:1.5cm;}}";
    const catScores = (audit?.categories||[]).map((c:any)=>({name:c.name,score:c.score}));
    const scoreBar = (val:number,color:string) => `<div style="height:6px;border-radius:3px;background:#e2e8f0;overflow:hidden;"><div style="height:100%;width:${val}%;background:${color};border-radius:3px;"></div></div>`;
    const scoreColor = (s:number) => s>=70?"#dc2626":s>=50?"#d97706":"#16a34a";

    // Shared SVG Score Donut
    const donutSVG = (score:number) => {
      const r=54,c=2*Math.PI*r,dash=(score/100)*c;
      const col=score>=70?"#dc2626":score>=50?"#d97706":"#16a34a";
      return `<svg width="140" height="140" viewBox="0 0 140 140"><circle cx="70" cy="70" r="${r}" fill="none" stroke="#e2e8f0" stroke-width="12"/><circle cx="70" cy="70" r="${r}" fill="none" stroke="${col}" stroke-width="12" stroke-dasharray="${dash} ${c}" stroke-dashoffset="${c/4}" stroke-linecap="round"/><text x="70" y="74" text-anchor="middle" font-size="28" font-weight="900" fill="${col}" font-family="system-ui">${score}</text><text x="70" y="90" text-anchor="middle" font-size="11" fill="#94a3b8" font-family="system-ui">/100</text></svg>`;
    };

    const header = (title:string, subtitle:string) => `
      <div style="background:linear-gradient(135deg,#1B4080 0%,#0d2545 100%);padding:40px 48px;margin-bottom:0;">
        <div style="font-size:10px;letter-spacing:3px;color:rgba(255,255,255,0.5);text-transform:uppercase;margin-bottom:10px;font-weight:600;">SEO Season · Manav S · Prepared for ${siteUrl}</div>
        <div style="display:flex;justify-content:space-between;align-items:flex-end;">
          <div>
            <h1 style="margin:0 0 6px;font-size:30px;font-weight:200;color:#fff;letter-spacing:-0.5px;">${title}</h1>
            <p style="margin:0;font-size:15px;color:rgba(255,255,255,0.6);">${subtitle}</p>
          </div>
          ${donutSVG(auditScore)}
        </div>
      </div>
      <div style="height:4px;background:linear-gradient(90deg,#E8652A,#f97316);"></div>`;

    const footer = () => `<div style="margin-top:40px;padding-top:16px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;font-size:11px;color:#94a3b8;font-family:system-ui;"><span><strong style="color:#1B4080;">Manav S</strong> · SEO Season · seoseason.com</span><span>${new Date().toLocaleDateString("en-GB",{day:"numeric",month:"long",year:"numeric"})}</span></div>`;

    const base = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>*{box-sizing:border-box;margin:0;padding:0;}body{font-family:'Segoe UI',system-ui,sans-serif;color:#1e293b;background:#fff;line-height:1.6;}${printCSS}</style>`;

    // Category scores bar chart
    const catChart = catScores.length ? `<div style="padding:24px 0;">
      ${catScores.map((c:any)=>`<div style="margin-bottom:14px;"><div style="display:flex;justify-content:space-between;margin-bottom:5px;"><span style="font-size:13px;font-weight:600;color:#374151;">${c.name}</span><span style="font-size:13px;font-weight:700;color:${scoreColor(c.score)}">${c.score}/100</span></div>${scoreBar(c.score,scoreColor(c.score))}</div>`).join("")}
    </div>` : "";

    if (docId === "executive_brief") {
      const findings = (data.topFindings||[]).map((f:any,i:number)=>`
        <div style="padding:20px;border:1px solid #e2e8f0;border-radius:10px;border-top:3px solid ${i===0?"#dc2626":i===1?"#d97706":"#16a34a"};">
          <div style="font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:${i===0?"#dc2626":i===1?"#d97706":"#16a34a"};margin-bottom:6px;">Finding ${i+1}</div>
          <div style="font-size:15px;font-weight:700;margin-bottom:6px;">${f.title||""}</div>
          <div style="font-size:13px;color:#475569;line-height:1.6;margin-bottom:8px;">${f.detail||""}</div>
          <div style="font-size:12px;font-weight:600;color:#1B4080;background:#EEF4FF;padding:8px 12px;border-radius:6px;">Impact: ${f.impact||""}</div>
        </div>`).join("");
      return base + `<body>
        ${header(data.headline||"SEO Executive Brief", data.subtitle||"")}
        <div style="padding:40px 48px;">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:32px;margin-bottom:32px;">
            <div>
              <div style="font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#1B4080;margin-bottom:12px;">Situation Overview</div>
              <p style="font-size:14px;color:#374151;line-height:1.75;">${data.scoreContext||""}</p>
              <div style="margin-top:20px;">${catChart}</div>
            </div>
            <div>
              <div style="font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#1B4080;margin-bottom:12px;">Top Findings</div>
              <div style="display:flex;flex-direction:column;gap:12px;">${findings}</div>
            </div>
          </div>
          <div style="padding:24px;background:linear-gradient(135deg,#F0F9FF,#E0F2FE);border-radius:12px;margin-bottom:24px;">
            <div style="font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#0369a1;margin-bottom:10px;">The Opportunity</div>
            <p style="font-size:14px;color:#0c4a6e;line-height:1.75;">${data.opportunity||""}</p>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">
            <div style="padding:20px;background:#FEF9EE;border:1px solid #FCD34D;border-radius:10px;">
              <div style="font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#92400E;margin-bottom:8px;">Why Act Now</div>
              <p style="font-size:13px;color:#78350F;line-height:1.6;">${data.urgencyReason||""}</p>
            </div>
            <div style="padding:20px;background:#F0FDF4;border:1px solid #86EFAC;border-radius:10px;">
              <div style="font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#166534;margin-bottom:8px;">Recommended Next Step</div>
              <p style="font-size:13px;color:#14532D;line-height:1.6;font-weight:600;">${data.nextStep||""}</p>
            </div>
          </div>
        </div>
        ${footer()}</body></html>`;
    }

    if (docId === "pitch_deck") {
      const slideColors = ["#1B4080","#0f2655","#1B4080","#0d4429","#1B4080","#2d1b4e","#C94F1A"];
      const slides = (data.slides||[]).map((s:any,i:number)=>`
        <div style="background:${slideColors[i]||"#1B4080"};color:#fff;padding:44px 52px;min-height:320px;border-radius:12px;margin-bottom:20px;page-break-inside:avoid;position:relative;overflow:hidden;">
          <div style="position:absolute;top:0;right:0;width:200px;height:200px;background:rgba(255,255,255,0.03);border-radius:50%;transform:translate(50px,-50px);"></div>
          <div style="font-size:10px;letter-spacing:3px;color:rgba(255,255,255,0.4);text-transform:uppercase;margin-bottom:8px;">Slide ${s.slide} · ${s.title||""}</div>
          <h2 style="font-size:26px;font-weight:300;margin-bottom:16px;line-height:1.2;max-width:600px;">${s.headline||""}</h2>
          ${s.body?`<p style="font-size:14px;color:rgba(255,255,255,0.8);line-height:1.7;max-width:580px;">${s.body}</p>`:""}
          ${s.bullets?`<ul style="margin:0;padding:0 0 0 18px;">${(s.bullets||[]).map((b:string)=>`<li style="font-size:14px;color:rgba(255,255,255,0.85);margin-bottom:8px;line-height:1.5;">${b}</li>`).join("")}</ul>`:""}
          ${s.situation?`<div style="margin-top:12px;padding:12px 16px;background:rgba(255,255,255,0.08);border-radius:8px;"><div style="font-size:12px;color:rgba(255,255,255,0.6);margin-bottom:4px;">Situation:</div><p style="font-size:13px;margin:0;">${s.situation}</p><div style="font-size:12px;color:#86EFAC;margin-top:8px;font-weight:600;">Result: ${s.result||""}</div></div>`:""}
          ${s.dataPoint?`<div style="position:absolute;bottom:24px;right:32px;font-size:11px;color:rgba(255,255,255,0.5);background:rgba(255,255,255,0.08);padding:4px 12px;border-radius:20px;">${s.dataPoint}</div>`:""}
        </div>`).join("");
      return base + `<body><div style="padding:32px;">${header("SEO Pitch Deck","Strategy · Findings · Opportunity")}<div style="padding:32px 0;">${slides}</div>${footer()}</div></body></html>`;
    }

    if (docId === "case_study") {
      const metrics = Object.values(data.results||{}).map((m:any,i:number)=>`
        <div style="text-align:center;padding:24px;background:${i===0?"#F0FDF4":i===1?"#EFF6FF":"#FEF9EE"};border-radius:12px;">
          <div style="font-size:32px;font-weight:900;color:${i===0?"#16a34a":i===1?"#1B4080":"#d97706"};margin-bottom:4px;">${m.value||""}</div>
          <div style="font-size:12px;font-weight:600;color:#374151;margin-bottom:2px;">${m.label||""}</div>
          <div style="font-size:11px;color:#6b7280;">${m.timeframe||""}</div>
        </div>`).join("");
      const phases = Object.entries(data.approach||{}).map(([k,v]:any)=>`
        <div style="display:flex;gap:16px;margin-bottom:16px;">
          <div style="width:80px;shrink:0;"><div style="background:#1B4080;color:#fff;font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;padding:4px 8px;border-radius:4px;text-align:center;">${k.replace("phase","Phase ")}</div></div>
          <div style="flex:1;padding:12px 16px;background:#f8fafc;border-radius:8px;border-left:3px solid #1B4080;font-size:13px;color:#374151;">${v}</div>
        </div>`).join("");
      return base + `<body>
        ${header("Case Study","A similar business · similar challenges · measurable results")}
        <div style="padding:40px 48px;">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:32px;">
            <div style="padding:24px;background:#F8FAFC;border-radius:12px;">
              <div style="font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#1B4080;margin-bottom:10px;">Client Profile</div>
              <p style="font-size:13px;color:#374151;line-height:1.65;">${data.clientProfile||""}</p>
            </div>
            <div style="padding:24px;background:#FEF2F2;border-radius:12px;border-left:3px solid #dc2626;">
              <div style="font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#dc2626;margin-bottom:10px;">The Challenge</div>
              <p style="font-size:13px;color:#374151;line-height:1.65;">${data.challenge||""}</p>
            </div>
          </div>
          <div style="margin-bottom:28px;"><div style="font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#1B4080;margin-bottom:14px;">Our Approach</div>${phases}</div>
          <div style="margin-bottom:28px;"><div style="font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#1B4080;margin-bottom:14px;">Results</div><div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;">${metrics}</div></div>
          <div style="padding:20px 24px;background:linear-gradient(135deg,#1B4080,#0d2545);border-radius:12px;margin-bottom:24px;">
            <div style="font-size:32px;color:rgba(255,255,255,0.3);margin-bottom:8px;">"</div>
            <p style="font-size:15px;color:#fff;font-style:italic;line-height:1.7;margin-bottom:0;">${data.quote||""}</p>
          </div>
          <div style="padding:16px 20px;background:#F0FDF4;border-radius:10px;border-left:3px solid #16a34a;">
            <div style="font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#166534;margin-bottom:6px;">Why This Is Relevant For You</div>
            <p style="font-size:13px;color:#166534;line-height:1.6;">${data.relevance||""}</p>
          </div>
        </div>
        ${footer()}</body></html>`;
    }

    if (docId === "action_plan") {
      const phaseColors = ["#1B4080","#0d4429","#2d1b4e"];
      const phases = (data.phases||[]).map((p:any,i:number)=>`
        <div style="margin-bottom:28px;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;page-break-inside:avoid;">
          <div style="background:${phaseColors[i]||"#1B4080"};padding:18px 24px;display:flex;justify-content:space-between;align-items:center;">
            <div>
              <div style="font-size:10px;letter-spacing:2px;color:rgba(255,255,255,0.5);text-transform:uppercase;">${p.phase||""}</div>
              <div style="font-size:18px;font-weight:600;color:#fff;">${p.label||""}</div>
            </div>
            <div style="text-align:right;"><div style="font-size:12px;color:rgba(255,255,255,0.6);">${p.days||""}</div><div style="font-size:11px;color:rgba(255,255,255,0.4);">${p.focus||""}</div></div>
          </div>
          <div style="padding:20px 24px;">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px;">
              ${(p.tasks||[]).map((t:string,ti:number)=>`<div style="padding:10px 14px;background:#F8FAFC;border-radius:6px;font-size:13px;color:#374151;display:flex;gap:8px;align-items:flex-start;"><span style="color:${phaseColors[i]};font-weight:700;flex-shrink:0;">${ti+1}.</span>${t}</div>`).join("")}
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
              <div style="padding:12px 16px;background:#EFF6FF;border-radius:8px;"><div style="font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#1B4080;margin-bottom:4px;">Deliverable</div><div style="font-size:13px;color:#1e40af;">${p.deliverable||""}</div></div>
              <div style="padding:12px 16px;background:#F0FDF4;border-radius:8px;"><div style="font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#166534;margin-bottom:4px;">KPI</div><div style="font-size:13px;color:#14532D;">${p.kpi||""}</div></div>
            </div>
          </div>
        </div>`).join("");
      return base + `<body>
        ${header("90-Day Action Plan","Phased roadmap · specific tasks · measurable outcomes")}
        <div style="padding:40px 48px;">
          <div style="padding:20px 24px;background:#F0F9FF;border-radius:12px;margin-bottom:28px;border-left:4px solid #1B4080;">
            <p style="font-size:14px;color:#0c4a6e;line-height:1.75;margin:0;">${data.overview||""}</p>
          </div>
          ${phases}
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:8px;">
            <div style="padding:20px;background:#FEF9EE;border:1px solid #FCD34D;border-radius:10px;"><div style="font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#92400E;margin-bottom:6px;">Investment</div><div style="font-size:22px;font-weight:700;color:#78350F;">${data.investment||"[INVESTMENT]"}</div></div>
            <div style="padding:20px;background:#F0FDF4;border:1px solid #86EFAC;border-radius:10px;"><div style="font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#166534;margin-bottom:6px;">Outcome Commitment</div><div style="font-size:13px;color:#14532D;line-height:1.6;">${data.guarantee||""}</div></div>
          </div>
        </div>
        ${footer()}</body></html>`;
    }

    if (docId === "competitive_brief") {
      const listItems = (items:string[], color:string, bg:string) =>
        (items||[]).map(i=>`<div style="padding:12px 16px;background:${bg};border-radius:8px;border-left:3px solid ${color};font-size:13px;color:#374151;line-height:1.6;margin-bottom:8px;">${i}</div>`).join("");
      return base + `<body>
        ${header("Competitive Opportunity Brief","Market position · vulnerabilities · strategic opportunity")}
        <div style="padding:40px 48px;">
          <div style="padding:20px 24px;background:#F8FAFC;border-radius:12px;margin-bottom:28px;border-left:4px solid #6366f1;">
            <div style="font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#4338ca;margin-bottom:10px;">Market Context</div>
            <p style="font-size:14px;color:#374151;line-height:1.75;margin:0;">${data.marketContext||""}</p>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:24px;">
            <div>
              <div style="font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#dc2626;margin-bottom:12px;">🔴 Current Gaps</div>
              ${listItems(data.gapAnalysis||[], "#dc2626", "#FEF2F2")}
            </div>
            <div>
              <div style="font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#d97706;margin-bottom:12px;">⚠ Vulnerabilities</div>
              ${listItems(data.vulnerabilities||[], "#d97706", "#FEF9EE")}
            </div>
          </div>
          <div style="margin-bottom:24px;">
            <div style="font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#16a34a;margin-bottom:12px;">✅ Opportunities</div>
            ${listItems(data.opportunities||[], "#16a34a", "#F0FDF4")}
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">
            <div style="padding:20px;background:#FEF9EE;border:1px solid #FCD34D;border-radius:10px;">
              <div style="font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#92400E;margin-bottom:8px;">Why Act Now</div>
              <p style="font-size:13px;color:#78350F;line-height:1.6;margin:0;">${data.urgency||""}</p>
            </div>
            <div style="padding:20px;background:linear-gradient(135deg,#1B4080,#0d2545);border-radius:10px;">
              <div style="font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:rgba(255,255,255,0.5);margin-bottom:8px;">Strategic Recommendation</div>
              <p style="font-size:13px;color:#fff;line-height:1.6;margin:0;">${data.recommendation||""}</p>
            </div>
          </div>
        </div>
        ${footer()}</body></html>`;
    }
    return `<html><body><p>Unknown document type</p></body></html>`;
  };

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
    // Auto-load context suggestions + document suggestions after audit
    post("generate_context_suggestions", { auditResult: r, url: url.trim(), currentContext: salesContext })
      .then(rs => setCtxSuggestions((rs as any).suggestions || []));
    post("suggest_sales_documents", { auditResult: r, url: url.trim() })
      .then(rs => setDocSuggestions((rs as any).suggestions || []));
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
                  <div className={"text-3xl font-black " + ((audit.score||0)>=70?"text-red-400":(audit.score||0)>=50?"text-yellow-400":"text-green-400")}>{audit.score||0}</div>
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
                    <span className={"text-sm font-bold " + (cat.score>=70?"text-red-400":cat.score>=50?"text-yellow-400":"text-green-400")}>{cat.score}/100</span>
                  </div>
                  <div className="space-y-2">
                    {(cat.issues||[]).map((issue:any,ii:number)=>(
                      <div key={ii} className="text-xs p-3 rounded-lg"
                        style={{background:(SEV_COLOR[issue.severity]||"#6366f1")+"10",borderLeft:"2px solid "+(SEV_COLOR[issue.severity]||"#6366f1")}}>
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

            {/* Regenerate */}
            <div className="mt-5 pt-5 border-t border-border flex justify-between">
              <button onClick={runAudit} disabled={loading}
                className="px-4 py-2 rounded-xl border border-border text-xs font-medium hover:border-primary/40 disabled:opacity-50">
                ↺ Regenerate with context
              </button>
            </div>
          </div>
        )}

        {/* Sales Documents Suite */}
        {audit && (
          <div className="rounded-2xl border border-border bg-card p-5 mb-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-sm font-bold">📁 Sales Documents</div>
                <div className="text-xs text-muted-foreground mt-0.5">Client-ready documents based on the audit. Each is beautifully formatted and downloadable as PDF or Word.</div>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3">
              {(docSuggestions.length > 0 ? docSuggestions : [
                {id:"executive_brief",label:"Executive Brief",icon:"📋",desc:"1-page summary for decision makers",priority:"essential"},
                {id:"pitch_deck",label:"Pitch Deck",icon:"🎯",desc:"7-slide visual presentation",priority:"essential"},
                {id:"case_study",label:"Case Study",icon:"📊",desc:"Real-world results from a similar business",priority:"essential"},
                {id:"action_plan",label:"90-Day Action Plan",icon:"🗓",desc:"Phased roadmap with KPIs",priority:"essential"},
                {id:"competitive_brief",label:"Competitive Brief",icon:"⚔️",desc:"Gaps, vulnerabilities and opportunities",priority:"recommended"},
              ]).map((doc:any) => {
                const generated = generatedDocs[doc.id];
                const isGenerating = generatingDoc === doc.id;
                return (
                  <div key={doc.id} className="flex items-center gap-4 p-4 rounded-xl border border-border hover:border-primary/30 transition-colors">
                    <div className="text-2xl">{doc.icon}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-sm font-semibold">{doc.label}</span>
                        <span className={"text-xs px-2 py-0.5 rounded-full font-medium " + (doc.priority==="essential" ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground")}>{doc.priority}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">{doc.desc}</div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {generated ? (
                        <>
                          <button onClick={() => {
                            const html = renderDocHTML(doc.id, generated.data, url, audit.score||0);
                            downloadAsPDF(html, doc.id+"-"+slug+".pdf");
                          }} className="px-3 py-1.5 rounded-lg border border-green-500/40 text-green-400 text-xs font-medium hover:bg-green-500/10">⬇ PDF</button>
                          <button onClick={() => {
                            const html = renderDocHTML(doc.id, generated.data, url, audit.score||0);
                            downloadAsDoc(html, doc.id+"-"+slug+".doc");
                          }} className="px-3 py-1.5 rounded-lg border border-green-500/40 text-green-400 text-xs font-medium hover:bg-green-500/10">⬇ Word</button>
                          <button onClick={() => generateDoc(doc.id)} className="px-3 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:border-primary/40">↺</button>
                        </>
                      ) : (
                        <button onClick={() => generateDoc(doc.id)} disabled={isGenerating}
                          className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 disabled:opacity-50">
                          {isGenerating ? "Generating…" : "Generate"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
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
