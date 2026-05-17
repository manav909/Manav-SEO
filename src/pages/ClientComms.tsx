import AnimatedBg from "@/components/AnimatedBg";
import PortalNav from '@/components/PortalNav';
import { useProject } from '@/contexts/ProjectContext';
import React, { useState, useEffect, useRef } from "react";

const post = (action: string, body: any = {}) =>
  fetch("/api/task-engine", { method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...body }) }).then(r => r.json()).catch(() => ({}));

// Mood Meter Component
function MoodMeter({ score }: { score: number }) {
  const clamp = Math.max(0, Math.min(100, score));
  const color = clamp >= 75 ? "#10b981" : clamp >= 55 ? "#6366f1" : clamp >= 35 ? "#f59e0b" : clamp >= 15 ? "#ef4444" : "#dc2626";
  const label = clamp >= 80 ? "Delighted" : clamp >= 65 ? "Positive" : clamp >= 50 ? "Neutral" : clamp >= 35 ? "Concerned" : clamp >= 20 ? "Unhappy" : "Frustrated";
  const emoji = clamp >= 80 ? "😄" : clamp >= 65 ? "🙂" : clamp >= 50 ? "😐" : clamp >= 35 ? "😟" : clamp >= 20 ? "😠" : "😡";
  const angle = (clamp / 100) * 180 - 90;
  return (
    <div style={{ textAlign: "center" }}>
      <svg width={160} height={90} viewBox="0 0 160 90">
        <defs>
          <linearGradient id="mg" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#dc2626"/>
            <stop offset="25%" stopColor="#ef4444"/>
            <stop offset="50%" stopColor="#f59e0b"/>
            <stop offset="75%" stopColor="#6366f1"/>
            <stop offset="100%" stopColor="#10b981"/>
          </linearGradient>
        </defs>
        {/* Track */}
        <path d="M 15 80 A 65 65 0 0 1 145 80" fill="none" stroke="var(--border)" strokeWidth={10} strokeLinecap="round"/>
        {/* Fill */}
        <path d="M 15 80 A 65 65 0 0 1 145 80" fill="none" stroke="url(#mg)" strokeWidth={10} strokeLinecap="round"
          strokeDasharray={`${(clamp/100)*204} 204`}/>
        {/* Needle */}
        <g transform={`rotate(${angle}, 80, 80)`}>
          <line x1={80} y1={80} x2={80} y2={25} stroke="white" strokeWidth={2} strokeLinecap="round"/>
          <circle cx={80} cy={80} r={5} fill={color}/>
        </g>
        {/* Score */}
        <text x={80} y={72} textAnchor="middle" fill={color} fontSize={16} fontWeight={700} fontFamily="monospace">{clamp}</text>
      </svg>
      <div style={{ fontSize: 14, fontWeight: 700, color, marginTop: -8 }}>{emoji} {label}</div>
    </div>
  );
}

// Timezone Clock
function TZClock({ tz }: { tz: any }) {
  const [time, setTime] = useState("");
  useEffect(() => {
    const update = () => {
      try {
        const t = new Date().toLocaleTimeString("en-GB", { timeZone: tz.tz, hour: "2-digit", minute: "2-digit" });
        setTime(t);
      } catch { setTime("--:--"); }
    };
    update();
    const id = setInterval(update, 10000);
    return () => clearInterval(id);
  }, [tz.tz]);
  const c = tz.business_status === "business" ? "#10b981" : tz.business_status === "early" || tz.business_status === "evening" ? "#f59e0b" : "var(--text-muted)";
  return (
    <div style={{ background: "var(--bg-card)", border: `0.5px solid ${c}30`, borderRadius: 9, padding: "8px 12px",
      display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <div>
        <div style={{ fontSize: 11, color: "var(--text)" }}>{tz.flag} {tz.region}</div>
        <div style={{ fontSize: 9, color: "var(--text-muted)" }}>{tz.day}</div>
      </div>
      <div>
        <div style={{ fontSize: 14, fontWeight: 700, fontFamily: "monospace", color: c }}>{time}</div>
        <div style={{ fontSize: 9, color: c, textAlign: "right" as const }}>
          {tz.business_status === "business" ? "● OPEN" : tz.business_status === "early" ? "◌ EARLY" : tz.business_status === "evening" ? "◌ EVE" : "○ OFF"}
        </div>
      </div>
    </div>
  );
}

const OBJECTION_TYPES = [
  { key: "price", label: "💰 Too Expensive", icon: "💰" },
  { key: "results", label: "📉 No Results Yet", icon: "📉" },
  { key: "trust", label: "🤔 Trust Issues", icon: "🤔" },
  { key: "timing", label: "⏰ Bad Timing", icon: "⏰" },
  { key: "competitor", label: "🏆 Competitor", icon: "🏆" },
  { key: "internal_politics", label: "🏢 Internal Politics", icon: "🏢" },
  { key: "budget", label: "✂️ Budget Cut", icon: "✂️" },
  { key: "seo_scepticism", label: "❓ SEO Sceptic", icon: "❓" },
  { key: "previous_bad_experience", label: "😤 Bad Experience", icon: "😤" },
  { key: "roi_proof", label: "📊 Needs ROI Proof", icon: "📊" },
  { key: "boss_approval", label: "👔 Needs Approval", icon: "👔" },
  { key: "agency_change", label: "🔄 Wants to Switch", icon: "🔄" },
];

const UPDATE_TYPES = [
  { key: "email", label: "📧 Email", desc: "Professional email update" },
  { key: "slack", label: "💬 Slack", desc: "Quick Slack message" },
  { key: "whatsapp", label: "📱 WhatsApp", desc: "Conversational update" },
  { key: "formal", label: "📋 Formal", desc: "Written report format" },
  { key: "executive", label: "🎯 Executive", desc: "C-suite brief" },
];

const PRES_TYPES = [
  { key: "progress_update", label: "📈 Progress Update" },
  { key: "proposal", label: "🤝 Proposal" },
  { key: "onboarding", label: "🚀 Onboarding" },
  { key: "quarterly_review", label: "📊 Quarterly Review" },
  { key: "case_study", label: "🏆 Case Study" },
  { key: "demo", label: "🎮 Demo" },
  { key: "walkthrough", label: "🗺 Walkthrough" },
];

export default function ClientComms() {
  const { selectedProjectId: projectId } = useProject();
  const [tab, setTab] = useState<"analyser"|"objections"|"updates"|"presentations"|"timezones">("analyser");
  const [projects, setProjects] = useState<any[]>([]);
  const [selProject, setSelProject] = useState("");

  // Analyser state
  const [convText, setConvText] = useState("");
  const [channel, setChannel] = useState("email");
  const [analysing, setAnalysing] = useState(false);
  const [analysis, setAnalysis] = useState<any>(null);
  const [generatingResp, setGenResp] = useState(false);
  const [responses, setResponses] = useState<any>(null);
  const [copiedIdx, setCopied] = useState<number|null>(null);

  // Objections state
  const [selObjType, setSelObjType] = useState("");
  const [objText, setObjText] = useState("");
  const [objLang, setObjLang] = useState("en");
  const [objResult, setObjResult] = useState<any>(null);
  const [loadingObj, setLoadingObj] = useState(false);

  // Updates state
  const [updateType, setUpdateType] = useState("email");
  const [updateLang, setUpdateLang] = useState("en");
  const [updateResult, setUpdateResult] = useState<any>(null);
  const [genUpdate, setGenUpdate] = useState(false);

  // Presentations state
  const [presType, setPresType] = useState("progress_update");
  const [presLang, setPresLang] = useState("en");
  const [presResult, setPresResult] = useState<any>(null);
  const [genPres, setGenPres] = useState(false);
  const [presentations, setPresentations] = useState<any[]>([]);
  const [presPreview, setPresPreview] = useState<string|null>(null);

  // Timezones
  const [timezones, setTimezones] = useState<any[]>([]);
  const [tzFilter, setTzFilter] = useState<"all"|"open"|"soon">("all");

  useEffect(() => {
    import("@/lib/supabase").then(({ supabase }) => {
      supabase.from("projects").select("id,name").limit(20).then(({ data }) => {
        setProjects(data || []);
        if (data?.length) setSelProject(data[0].id);
      });
    });
    post("get_timezones").then(r => setTimezones((r as any).timezones || []));
  }, []);

  useEffect(() => {
    if (selProject && tab === "presentations") {
      post("get_presentations", { projectId: selProject }).then(r => setPresentations((r as any).presentations || []));
    }
  }, [selProject, tab]);

  async function doAnalyse() {
    if (!convText.trim()) return;
    setAnalysing(true); setAnalysis(null); setResponses(null);
    const r = await post("analyse_conversation", { text: convText, projectId: selProject || undefined, channel });
    setAnalysis((r as any).analysis);
    setAnalysing(false);
  }

  async function doGenerateResponses() {
    if (!analysis) return;
    setGenResp(true);
    const r = await post("generate_responses", { text: convText, analysis, projectId: selProject || undefined });
    setResponses(r);
    setGenResp(false);
  }

  async function copyText(text: string, idx: number) {
    await navigator.clipboard.writeText(text).catch(() => {});
    setCopied(idx); setTimeout(() => setCopied(null), 2000);
  }

  async function doHandleObj() {
    if (!selObjType) return;
    setLoadingObj(true); setObjResult(null);
    const r = await post("handle_objection", {
      objectionType: selObjType, objectionText: objText || selObjType,
      language: objLang, projectId: selProject || undefined,
    });
    setObjResult(r);
    setLoadingObj(false);
  }

  async function doGenUpdate() {
    if (!selProject) return;
    setGenUpdate(true); setUpdateResult(null);
    const r = await post("generate_client_update", { projectId: selProject, updateType, language: updateLang });
    setUpdateResult(r);
    setGenUpdate(false);
  }

  async function doGenPresentation() {
    setGenPres(true); setPresResult(null);
    const r = await post("generate_presentation", {
      type: presType, projectId: selProject || undefined, language: presLang,
    });
    setPresResult(r);
    if (selProject) post("get_presentations", { projectId: selProject }).then(r2 => setPresentations((r2 as any).presentations || []));
    setGenPres(false);
  }

  const S: any = {
    root: { minHeight: "100vh", background: "#06060e", color: "#e8e8f8",
      fontFamily: "-apple-system,'SF Pro Display',system-ui,sans-serif" },
    hdr: { background: "#09091a", borderBottom: "0.5px solid #1a1a3a", padding: "0 20px",
      height: 52, display: "flex", alignItems: "center", justifyContent: "space-between",
      position: "sticky" as const, top: 0, zIndex: 100 },
    tabs: { display: "flex", background: "#09091a", borderBottom: "0.5px solid #1a1a3a", padding: "0 20px", overflowX: "auto" as const },
    tab: { padding: "9px 14px", fontSize: 12, fontWeight: 500, cursor: "pointer",
      border: "none", background: "transparent", color: "var(--text-sub)",
      borderBottom: "2px solid transparent", whiteSpace: "nowrap" as const },
    tabA: { color: "#a78bfa", borderBottom: "2px solid #a78bfa" },
    body: { padding: "16px 20px", maxWidth: 1100, margin: "0 auto" },
    card: { background: "var(--bg-card)", border: "0.5px solid #1a1a3a", borderRadius: 12, padding: 16, marginBottom: 12 },
    textarea: { width: "100%", background: "#070710", border: "0.5px solid #1a1a3a", borderRadius: 10,
      color: "#e8e8f8", padding: "12px 14px", fontSize: 13, lineHeight: 1.6,
      resize: "vertical" as const, outline: "none", minHeight: 140, boxSizing: "border-box" as const },
    inp: { background: "#070710", border: "0.5px solid #1a1a3a", borderRadius: 8,
      color: "#e8e8f8", padding: "8px 12px", fontSize: 12, outline: "none" },
    sel: { background: "var(--bg-card)", border: "0.5px solid #1a1a3a", borderRadius: 8,
      color: "#e8e8f8", padding: "8px 12px", fontSize: 12 },
    btn: (c: string = "#6366f1") => ({
      background: `${c}18`, border: `0.5px solid ${c}40`, borderRadius: 8,
      color: c, padding: "8px 16px", fontSize: 12, fontWeight: 600, cursor: "pointer",
    }),
    badge: (c: string) => ({
      fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 20,
      background: `${c}18`, color: c, border: `0.5px solid ${c}30`,
    }),
    sec: { fontSize: 10, fontWeight: 600, letterSpacing: 1.2, textTransform: "uppercase" as const,
      color: "var(--text-muted)", marginBottom: 8, marginTop: 14 },
    riskColor: (r: string) => r === "critical" ? "#dc2626" : r === "high" ? "#ef4444" : r === "medium" ? "#f59e0b" : "#10b981",
    intentColor: (i: string) => i === "churning" || i === "escalating" ? "#ef4444" :
      i === "upgrading" || i === "praising" ? "#10b981" : i === "negotiating" ? "#f59e0b" : "#6366f1",
  };

  const filteredTZ = timezones.filter(z =>
    tzFilter === "all" ? true :
    tzFilter === "open" ? z.business_status === "business" :
    tzFilter === "soon" ? z.business_status === "early" || z.business_status === "evening" : true
  );

  return (
    <div style={S.root}>
      <PortalNav />
      
      {/* Header */}
      <div style={S.hdr}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>💬 Client Communications Powerhouse</div>
          <div style={{ fontSize: 10, color: "#3b3b5a", letterSpacing: 1 }}>GLOBAL INTELLIGENCE</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <select style={S.sel} value={selProject} onChange={e => setSelProject(e.target.value)}>
            <option value="">— Select project —</option>
            {projects.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      </div>

      {/* Tabs */}
      <div style={S.tabs}>
        {([
          ["analyser", "🧠 Conversation Analyser"],
          ["objections", "🛡 Objection Handler"],
          ["updates", "📨 Client Updates"],
          ["presentations", "🎯 Presentations & Demos"],
          ["timezones", "🌍 World Clock"],
        ] as [typeof tab, string][]).map(([id, label]) => (
          <button key={id} style={{ ...S.tab, ...(tab === id ? S.tabA : {}) }} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      <div style={S.body}>

        {/* ── ANALYSER TAB ──────────────────────────────────── */}
        {tab === "analyser" && (
          <div>
            <div style={{ marginBottom: 12, color: "var(--text-sub)", fontSize: 13 }}>
              Paste any client or lead message — any language, any channel. Get instant mood score, objection detection, cultural context, and 3 ready-to-send responses.
            </div>
            <div style={S.card}>
              <div style={{ display: "flex", gap: 8, marginBottom: 10, alignItems: "center" }}>
                <select style={S.sel} value={channel} onChange={e => setChannel(e.target.value)}>
                  {["email","whatsapp","slack","linkedin","phone","meeting","other"].map(c => (
                    <option key={c} value={c}>{c.charAt(0).toUpperCase()+c.slice(1)}</option>
                  ))}
                </select>
                <div style={{ fontSize: 11, color: "var(--text-muted)", flex: 1 }}>Paste conversation below — any language</div>
                {analysis && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={S.badge(S.riskColor(analysis.risk_level))}>{analysis.risk_level?.toUpperCase()} RISK</span>
                    <span style={S.badge(S.intentColor(analysis.intent))}>{analysis.intent?.toUpperCase()}</span>
                    {analysis.detected_language && analysis.detected_language !== "en" && (
                      <span style={S.badge("#06b6d4")}>{analysis.language_name}</span>
                    )}
                  </div>
                )}
              </div>
              <textarea style={S.textarea} value={convText} onChange={e => setConvText(e.target.value)}
                placeholder="Paste client message here... (any language: English, Arabic, Hindi, French, Spanish, German, Chinese, etc.)" />
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button style={S.btn("#6366f1")} onClick={doAnalyse} disabled={analysing || !convText.trim()}>
                  {analysing ? "Analysing..." : "🧠 Analyse Message"}
                </button>
                {analysis && (
                  <button style={S.btn("#10b981")} onClick={doGenerateResponses} disabled={generatingResp}>
                    {generatingResp ? "Generating..." : "✍️ Generate 3 Responses"}
                  </button>
                )}
                {convText && <button style={S.btn("var(--text-muted)")} onClick={() => { setConvText(""); setAnalysis(null); setResponses(null); }}>Clear</button>}
              </div>
            </div>

            {/* Analysis results */}
            {analysis && (
              <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 12 }}>
                {/* Mood meter */}
                <div style={S.card}>
                  <MoodMeter score={analysis.mood_score || 50} />
                  <div style={{ marginTop: 12 }}>
                    <div style={S.sec}>Emotional State</div>
                    <div style={{ fontSize: 12, color: "#d0d0e8", lineHeight: 1.6 }}>{analysis.emotional_state}</div>
                    {analysis.emotional_subtext && (
                      <>
                        <div style={{ ...S.sec, marginTop: 10 }}>What They Really Feel</div>
                        <div style={{ fontSize: 11, color: "var(--text-sub)", lineHeight: 1.5, fontStyle: "italic" }}>
                          "{analysis.emotional_subtext}"
                        </div>
                      </>
                    )}
                    {analysis.urgency && analysis.urgency !== "normal" && (
                      <div style={{ marginTop: 10, padding: "6px 10px", borderRadius: 8,
                        background: analysis.urgency === "immediate" ? "rgba(239,68,68,.1)" : "rgba(245,158,11,.1)",
                        border: `0.5px solid ${analysis.urgency === "immediate" ? "rgba(239,68,68,.3)" : "rgba(245,158,11,.3)"}`,
                        fontSize: 11, color: analysis.urgency === "immediate" ? "#f87171" : "#f59e0b" }}>
                        ⚡ {analysis.urgency.toUpperCase()} URGENCY
                      </div>
                    )}
                  </div>
                </div>

                {/* Analysis details */}
                <div>
                  {/* Cultural context */}
                  {(analysis.cultural_context || analysis.geopolitical_notes) && (
                    <div style={{ ...S.card, borderColor: "rgba(6,182,212,.2)" }}>
                      <div style={S.sec}>🌍 Cultural & Geopolitical Context</div>
                      {analysis.cultural_context && <div style={{ fontSize: 12, color: "#d0d0e8", lineHeight: 1.6, marginBottom: 6 }}>{analysis.cultural_context}</div>}
                      {analysis.geopolitical_notes && <div style={{ fontSize: 11, color: "var(--text-sub)", lineHeight: 1.5, fontStyle: "italic" }}>{analysis.geopolitical_notes}</div>}
                    </div>
                  )}

                  {/* Objections */}
                  {analysis.objections?.length > 0 && (
                    <div style={{ ...S.card, borderColor: "rgba(239,68,68,.2)" }}>
                      <div style={S.sec}>🚧 Objections Detected ({analysis.objections.length})</div>
                      {analysis.objections.map((obj: any, i: number) => (
                        <div key={i} style={{ display: "flex", gap: 10, padding: "7px 0", borderBottom: "0.5px solid #111128" }}>
                          <span style={{ ...S.badge(obj.severity === "dealbreaker" ? "#dc2626" : obj.severity === "strong" ? "#ef4444" : obj.severity === "moderate" ? "#f59e0b" : "var(--text-sub)") }}>
                            {obj.severity?.toUpperCase()}
                          </span>
                          <div>
                            <div style={{ fontSize: 11, color: "#a78bfa", fontWeight: 600, marginBottom: 2 }}>
                              {obj.type?.replace(/_/g, " ").toUpperCase()}
                              {obj.hidden && <span style={{ marginLeft: 6, fontSize: 9, color: "var(--text-muted)" }}>(implied)</span>}
                            </div>
                            <div style={{ fontSize: 12, color: "#d0d0e8" }}>{obj.text}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Strategy */}
                  <div style={S.card}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      <div>
                        <div style={S.sec}>Strategy</div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#a78bfa", marginBottom: 6 }}>{analysis.best_response_strategy?.replace(/_/g, " ")}</div>
                        {analysis.opening_move && (
                          <div style={{ fontSize: 12, color: "#d0d0e8", lineHeight: 1.5, padding: "8px 10px",
                            background: "rgba(99,102,241,.06)", borderRadius: 8, border: "0.5px solid rgba(99,102,241,.15)" }}>
                            <div style={{ fontSize: 9, color: "#6366f1", fontWeight: 600, marginBottom: 4 }}>OPENING MOVE</div>
                            {analysis.opening_move}
                          </div>
                        )}
                      </div>
                      <div>
                        {analysis.what_they_want && (
                          <>
                            <div style={S.sec}>What They Want</div>
                            <div style={{ fontSize: 12, color: "#10b981", lineHeight: 1.5, marginBottom: 8 }}>{analysis.what_they_want}</div>
                          </>
                        )}
                        {analysis.what_they_fear && (
                          <>
                            <div style={S.sec}>What They Fear</div>
                            <div style={{ fontSize: 12, color: "#f87171", lineHeight: 1.5 }}>{analysis.what_they_fear}</div>
                          </>
                        )}
                      </div>
                    </div>
                    {analysis.what_not_to_say?.length > 0 && (
                      <div style={{ marginTop: 10, padding: "8px 12px", background: "rgba(239,68,68,.04)", borderRadius: 8, border: "0.5px solid rgba(239,68,68,.15)" }}>
                        <div style={{ fontSize: 9, color: "#f87171", fontWeight: 600, marginBottom: 6 }}>⚠ DON'T SAY</div>
                        {analysis.what_not_to_say.map((w: string, i: number) => (
                          <div key={i} style={{ fontSize: 11, color: "#f87171", marginBottom: 2 }}>✗ {w}</div>
                        ))}
                      </div>
                    )}
                    {analysis.next_best_action && (
                      <div style={{ marginTop: 10, padding: "8px 12px", background: "rgba(16,185,129,.04)", borderRadius: 8, border: "0.5px solid rgba(16,185,129,.15)" }}>
                        <div style={{ fontSize: 9, color: "#10b981", fontWeight: 600, marginBottom: 4 }}>NEXT BEST ACTION</div>
                        <div style={{ fontSize: 12, color: "#34d399" }}>→ {analysis.next_best_action}</div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Generated responses */}
            {responses?.responses?.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", marginBottom: 10 }}>
                  ✍️ {responses.responses.length} Response Strategies
                  {analysis?.language_name && analysis.language_name !== "English" && (
                    <span style={{ marginLeft: 8, fontSize: 11, color: "#06b6d4" }}>in {analysis.language_name}</span>
                  )}
                </div>
                {responses.responses.map((resp: any, idx: number) => (
                  <div key={idx} style={{ ...S.card, borderColor: idx === 0 ? "rgba(99,102,241,.3)" : "var(--border)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{resp.strategy}</div>
                        <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                          <span style={S.badge("#6366f1")}>{resp.tone?.toUpperCase()}</span>
                          {resp.conversion_probability && (
                            <span style={S.badge(resp.conversion_probability >= 70 ? "#10b981" : resp.conversion_probability >= 50 ? "#f59e0b" : "#ef4444")}>
                              {resp.conversion_probability}% CONVERSION
                            </span>
                          )}
                          {resp.risk && <span style={S.badge(S.riskColor(resp.risk))}>RISK: {resp.risk?.toUpperCase()}</span>}
                        </div>
                        {resp.when_to_use && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>{resp.when_to_use}</div>}
                      </div>
                      <button style={S.btn(copiedIdx === idx ? "#10b981" : "#a78bfa")}
                        onClick={() => copyText(resp.body, idx)}>
                        {copiedIdx === idx ? "✓ Copied!" : "Copy"}
                      </button>
                    </div>
                    {resp.subject_line && (
                      <div style={{ fontSize: 11, color: "var(--text-sub)", marginBottom: 8, padding: "4px 8px",
                        background: "rgba(255,255,255,.03)", borderRadius: 6 }}>
                        Subject: {resp.subject_line}
                      </div>
                    )}
                    <div style={{ fontSize: 13, color: "#d0d0e8", lineHeight: 1.7, whiteSpace: "pre-wrap" as const }}>
                      {resp.body}
                    </div>
                  </div>
                ))}
                {responses.follow_up_sequence?.length > 0 && (
                  <div style={{ ...S.card, borderColor: "rgba(245,158,11,.15)" }}>
                    <div style={S.sec}>📅 Follow-up Sequence</div>
                    {responses.follow_up_sequence.map((f: string, i: number) => (
                      <div key={i} style={{ fontSize: 12, color: "#d0d0e8", padding: "5px 0", borderBottom: "0.5px solid #111128" }}>
                        <span style={{ color: "#f59e0b", marginRight: 8 }}>Day {i===0?"2":"5"}:</span>{f}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── OBJECTION HANDLER TAB ─────────────────────────── */}
        {tab === "objections" && (
          <div>
            <div style={{ marginBottom: 12, color: "var(--text-sub)", fontSize: 13 }}>
              Select an objection type, paste the exact words if you have them, choose language. Get a structured response framework, power phrases, and a ready-to-use response.
            </div>
            <div style={S.card}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))", gap: 8, marginBottom: 14 }}>
                {OBJECTION_TYPES.map(obj => (
                  <button key={obj.key}
                    onClick={() => setSelObjType(obj.key)}
                    style={{ background: selObjType === obj.key ? "rgba(99,102,241,.2)" : "rgba(255,255,255,.03)",
                      border: `0.5px solid ${selObjType === obj.key ? "#6366f1" : "var(--border)"}`,
                      borderRadius: 9, padding: "10px 12px", fontSize: 12, color: selObjType === obj.key ? "#a78bfa" : "var(--text-sub)",
                      cursor: "pointer", textAlign: "left" as const }}>
                    <div style={{ fontSize: 16, marginBottom: 4 }}>{obj.icon}</div>
                    {obj.label}
                  </button>
                ))}
              </div>
              {selObjType && (
                <>
                  <div style={{ display: "flex", gap: 10, marginBottom: 10, alignItems: "center" }}>
                    <div style={{ flex: 1, fontSize: 12, color: "var(--text-muted)" }}>
                      Optional: paste their exact words (works better with specific text)
                    </div>
                    <select style={S.sel} value={objLang} onChange={e => setObjLang(e.target.value)}>
                      {[["en","English"],["ar","Arabic"],["hi","Hindi"],["fr","French"],["de","German"],
                        ["es","Spanish"],["pt","Portuguese"],["zh","Chinese"],["tr","Turkish"],["pl","Polish"],
                        ["nl","Dutch"],["it","Italian"],["ur","Urdu"],["ru","Russian"]].map(([k,v]) => (
                        <option key={k} value={k}>{v}</option>
                      ))}
                    </select>
                  </div>
                  <textarea style={{ ...S.textarea, minHeight: 80 }} value={objText} onChange={e => setObjText(e.target.value)}
                    placeholder={`Paste their exact words about "${selObjType.replace(/_/g," ")}"... (optional)`} />
                  <button style={{ ...S.btn("#6366f1"), marginTop: 10 }} onClick={doHandleObj} disabled={loadingObj}>
                    {loadingObj ? "Generating handler..." : "🛡 Get Objection Handler"}
                  </button>
                </>
              )}
            </div>

            {objResult?.generated && (
              <div>
                <div style={{ ...S.card, borderColor: "rgba(16,185,129,.2)" }}>
                  <div style={S.sec}>💡 What They Really Mean</div>
                  <div style={{ fontSize: 13, color: "#d0d0e8", lineHeight: 1.6, fontStyle: "italic", marginBottom: 12 }}>
                    "{objResult.generated.what_they_really_mean}"
                  </div>
                  {objResult.generated.power_phrase && (
                    <div style={{ padding: "10px 14px", background: "rgba(99,102,241,.08)", borderRadius: 9,
                      border: "0.5px solid rgba(99,102,241,.25)", marginBottom: 12 }}>
                      <div style={{ fontSize: 9, color: "#6366f1", fontWeight: 600, marginBottom: 6 }}>⚡ POWER PHRASE</div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", lineHeight: 1.5 }}>
                        "{objResult.generated.power_phrase}"
                      </div>
                    </div>
                  )}
                </div>
                <div style={{ ...S.card, borderColor: "rgba(99,102,241,.2)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <div style={S.sec}>Full Response</div>
                    <button style={S.btn("#a78bfa")} onClick={() => copyText(objResult.generated.full_response, 999)}>
                      {copiedIdx === 999 ? "✓ Copied!" : "Copy"}
                    </button>
                  </div>
                  <div style={{ fontSize: 13, color: "#d0d0e8", lineHeight: 1.7, whiteSpace: "pre-wrap" as const }}>
                    {objResult.generated.full_response}
                  </div>
                  {objResult.generated.supporting_evidence?.length > 0 && (
                    <>
                      <div style={{ ...S.sec, marginTop: 14 }}>Supporting Evidence to Use</div>
                      {objResult.generated.supporting_evidence.map((e: string, i: number) => (
                        <div key={i} style={{ fontSize: 12, color: "#10b981", padding: "4px 0", borderBottom: "0.5px solid #111128" }}>
                          ✓ {e}
                        </div>
                      ))}
                    </>
                  )}
                  {objResult.generated.close_move && (
                    <div style={{ marginTop: 12, padding: "8px 12px", background: "rgba(16,185,129,.06)",
                      borderRadius: 8, border: "0.5px solid rgba(16,185,129,.2)" }}>
                      <div style={{ fontSize: 9, color: "#10b981", fontWeight: 600, marginBottom: 4 }}>CLOSE MOVE</div>
                      <div style={{ fontSize: 12, color: "#34d399" }}>→ {objResult.generated.close_move}</div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── CLIENT UPDATES TAB ────────────────────────────── */}
        {tab === "updates" && (
          <div>
            <div style={{ marginBottom: 12, color: "var(--text-sub)", fontSize: 13 }}>
              Generate professional client updates in any format and any language. Uses real project data — tasks completed, wins, learnings.
            </div>
            <div style={S.card}>
              <div style={S.sec}>Update Format</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const, marginBottom: 14 }}>
                {UPDATE_TYPES.map(u => (
                  <button key={u.key} onClick={() => setUpdateType(u.key)}
                    style={{ background: updateType === u.key ? "rgba(99,102,241,.2)" : "rgba(255,255,255,.03)",
                      border: `0.5px solid ${updateType === u.key ? "#6366f1" : "var(--border)"}`,
                      borderRadius: 9, padding: "10px 14px", cursor: "pointer", textAlign: "left" as const }}>
                    <div style={{ fontSize: 13, color: updateType === u.key ? "#a78bfa" : "#e8e8f8" }}>{u.label}</div>
                    <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>{u.desc}</div>
                  </button>
                ))}
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12 }}>
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Language:</div>
                <select style={S.sel} value={updateLang} onChange={e => setUpdateLang(e.target.value)}>
                  {[["en","English"],["ar","Arabic"],["hi","Hindi"],["fr","French"],["de","German"],
                    ["es","Spanish"],["pt","Portuguese"],["zh","Chinese"],["tr","Turkish"],
                    ["pl","Polish"],["nl","Dutch"],["it","Italian"]].map(([k,v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
              <button style={S.btn("#6366f1")} onClick={doGenUpdate} disabled={genUpdate || !selProject}>
                {genUpdate ? "Generating update..." : "📨 Generate Update"}
              </button>
              {!selProject && <div style={{ fontSize: 11, color: "#f87171", marginTop: 6 }}>Select a project from the header first.</div>}
            </div>
            {updateResult?.content && (
              <div style={{ ...S.card, borderColor: "rgba(99,102,241,.25)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                  <div>
                    <span style={S.badge("#6366f1")}>{updateResult.updateType?.toUpperCase()}</span>
                    {updateResult.language !== "en" && <span style={{ ...S.badge("#06b6d4"), marginLeft: 6 }}>{updateResult.language}</span>}
                  </div>
                  <button style={S.btn("#a78bfa")} onClick={() => copyText(updateResult.content, 888)}>
                    {copiedIdx === 888 ? "✓ Copied!" : "Copy"}
                  </button>
                </div>
                <div style={{ fontSize: 13, color: "#d0d0e8", lineHeight: 1.8, whiteSpace: "pre-wrap" as const }}>
                  {updateResult.content}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── PRESENTATIONS TAB ─────────────────────────────── */}
        {tab === "presentations" && (
          <div>
            <div style={{ marginBottom: 12, color: "var(--text-sub)", fontSize: 13 }}>
              Generate beautiful client presentations, proposals, demos, and walkthroughs. Each gets a unique shareable link.
            </div>
            <div style={S.card}>
              <div style={S.sec}>Presentation Type</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const, marginBottom: 14 }}>
                {PRES_TYPES.map(p => (
                  <button key={p.key} onClick={() => setPresType(p.key)}
                    style={{ background: presType === p.key ? "rgba(99,102,241,.2)" : "rgba(255,255,255,.03)",
                      border: `0.5px solid ${presType === p.key ? "#6366f1" : "var(--border)"}`,
                      borderRadius: 9, padding: "9px 14px", fontSize: 12,
                      color: presType === p.key ? "#a78bfa" : "var(--text-sub)", cursor: "pointer" }}>
                    {p.label}
                  </button>
                ))}
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12 }}>
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Language:</div>
                <select style={S.sel} value={presLang} onChange={e => setPresLang(e.target.value)}>
                  {[["en","English"],["ar","Arabic"],["hi","Hindi"],["fr","French"],["de","German"],["es","Spanish"],["pt","Portuguese"]].map(([k,v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
              <button style={S.btn("#a78bfa")} onClick={doGenPresentation} disabled={genPres}>
                {genPres ? "Generating presentation..." : "🎯 Generate Presentation"}
              </button>
            </div>
            {presResult && (
              <div style={{ ...S.card, borderColor: "rgba(99,102,241,.3)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>✓ Presentation Ready</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button style={S.btn("#10b981")} onClick={() => setPresPreview(presResult.html)}>Preview</button>
                    {presResult.shareUrl && (
                      <a href={presResult.shareUrl} target="_blank" style={{ ...S.btn("#6366f1"), textDecoration: "none" }}>
                        Open ↗
                      </a>
                    )}
                    {presResult.shareUrl && (
                      <button style={S.btn("#a78bfa")} onClick={() => copyText(`${window.location.origin}${presResult.shareUrl}`, 777)}>
                        {copiedIdx === 777 ? "✓ Copied!" : "Copy Link"}
                      </button>
                    )}
                  </div>
                </div>
                {presPreview && (
                  <div style={{ background: "#070710", borderRadius: 8, padding: 16, maxHeight: 400, overflowY: "auto" as const }}
                    dangerouslySetInnerHTML={{ __html: presPreview }} />
                )}
              </div>
            )}
            {presentations.length > 0 && (
              <div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", margin: "12px 0 8px" }}>Previous presentations</div>
                {presentations.map((p: any) => (
                  <div key={p.id} style={{ ...S.card, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{p.title}</div>
                      <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                        <span style={S.badge("#6366f1")}>{p.presentation_type?.replace(/_/g," ")}</span>
                        <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{p.viewed_count} views</span>
                        <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{new Date(p.created_at).toLocaleDateString("en-GB")}</span>
                      </div>
                    </div>
                    <a href={`/presentation/${p.token}`} target="_blank" style={{ ...S.btn("var(--text-sub)"), textDecoration: "none" }}>Open ↗</a>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── TIMEZONES TAB ─────────────────────────────────── */}
        {tab === "timezones" && (
          <div>
            <div style={{ marginBottom: 12, color: "var(--text-sub)", fontSize: 13 }}>
              Live clocks for all your key client markets. Green = business hours. Orange = early morning or evening. Grey = offline.
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
              {(["all","open","soon"] as const).map(f => (
                <button key={f} style={{ ...S.btn(f === tzFilter ? "#a78bfa" : "var(--text-muted)"),
                  borderColor: f === tzFilter ? "rgba(167,139,250,.4)" : "var(--border)" }}
                  onClick={() => setTzFilter(f)}>
                  {f === "all" ? "🌍 All" : f === "open" ? "🟢 Open Now" : "🟡 Soon Open"}
                </button>
              ))}
              <div style={{ marginLeft: "auto", fontSize: 12, color: "var(--text-muted)", alignSelf: "center" }}>
                {filteredTZ.filter(z => z.business_status === "business").length} markets open now
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))", gap: 8 }}>
              {filteredTZ.map((tz, i) => <TZClock key={i} tz={tz} />)}
            </div>
            {filteredTZ.length === 0 && (
              <div style={{ color: "var(--text-muted)", textAlign: "center", padding: 40 }}>
                No markets match this filter right now.
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
