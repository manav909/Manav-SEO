import React, { useState } from "react";

export interface HelpConfig {
  title: string;
  what: string;
  why: string;
  howTo: { step: string; detail: string }[];
  tips: string[];
  actions?: { label: string; desc: string }[];
  faq?: { q: string; a: string }[];
}

interface Props {
  config: HelpConfig;
  position?: "right" | "bottom";
}

export function HelpPanel({ config, position = "right" }: Props) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"overview"|"howto"|"tips"|"faq">("overview");

  const S: any = {
    btn: {
      position: "fixed" as const,
      bottom: 24, right: 24, zIndex: 999,
      width: 42, height: 42, borderRadius: "50%",
      background: open ? "#6366f1" : "rgba(99,102,241,.15)",
      border: "0.5px solid rgba(99,102,241,.4)",
      color: open ? "#fff" : "#a78bfa",
      fontSize: 18, cursor: "pointer",
      display: "flex", alignItems: "center", justifyContent: "center",
      boxShadow: open ? "0 0 20px rgba(99,102,241,.4)" : "none",
      transition: "all .2s",
    },
    panel: {
      position: "fixed" as const,
      bottom: 76, right: 24, zIndex: 998,
      width: 360, maxHeight: "70vh",
      background: "#0d0d1e",
      border: "0.5px solid #2a2a4a",
      borderRadius: 14,
      boxShadow: "0 20px 60px rgba(0,0,0,.6)",
      display: "flex", flexDirection: "column" as const,
      overflow: "hidden",
    },
    header: {
      padding: "14px 16px 10px",
      borderBottom: "0.5px solid #1a1a3a",
      background: "rgba(99,102,241,.06)",
    },
    tabs: {
      display: "flex",
      borderBottom: "0.5px solid #1a1a3a",
      padding: "0 12px",
    },
    tab: {
      padding: "7px 10px", fontSize: 11, fontWeight: 500,
      cursor: "pointer", border: "none",
      background: "transparent", color: "#8b8ba8",
      borderBottom: "2px solid transparent",
    },
    tabA: { color: "#a78bfa", borderBottom: "2px solid #a78bfa" },
    body: { padding: "14px 16px", overflowY: "auto" as const, flex: 1 },
    sec: { fontSize: 10, fontWeight: 600, letterSpacing: 1.2,
      textTransform: "uppercase" as const, color: "#4b4b6a", marginBottom: 8, marginTop: 14 },
    step: {
      display: "flex", gap: 10, padding: "8px 0",
      borderBottom: "0.5px solid #111128",
    },
    num: {
      width: 20, height: 20, borderRadius: "50%", flexShrink: 0,
      background: "rgba(99,102,241,.2)", color: "#a78bfa",
      fontSize: 10, fontWeight: 700,
      display: "flex", alignItems: "center", justifyContent: "center",
      marginTop: 1,
    },
    tip: {
      display: "flex", gap: 8, padding: "6px 0",
      fontSize: 12, color: "#c0c0d8", lineHeight: 1.5,
      borderBottom: "0.5px solid #111128",
    },
    faqQ: { fontSize: 12, fontWeight: 600, color: "#f0f0ff", marginBottom: 4 },
    faqA: { fontSize: 12, color: "#8b8ba8", lineHeight: 1.5, marginBottom: 10 },
    action: {
      padding: "8px 10px", borderRadius: 8, marginBottom: 6,
      background: "rgba(99,102,241,.06)", border: "0.5px solid rgba(99,102,241,.15)",
    },
  };

  if (!open) {
    return (
      <button style={S.btn} onClick={() => setOpen(true)} title="Help & Guide">?</button>
    );
  }

  return (
    <>
      <button style={S.btn} onClick={() => setOpen(false)}>✕</button>
      <div style={S.panel}>
        <div style={S.header}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#f0f0ff", marginBottom: 4 }}>
            {config.title}
          </div>
          <div style={{ fontSize: 12, color: "#8b8ba8", lineHeight: 1.5 }}>
            {config.what}
          </div>
        </div>
        <div style={S.tabs}>
          {([
            ["overview", "Overview"],
            ["howto", "How To"],
            ["tips", "Tips"],
            ...(config.faq?.length ? [["faq", "FAQ"]] : []),
          ] as [typeof tab, string][]).map(([id, label]) => (
            <button key={id} style={{ ...S.tab, ...(tab === id ? S.tabA : {}) }}
              onClick={() => setTab(id as any)}>{label}
            </button>
          ))}
        </div>
        <div style={S.body}>
          {tab === "overview" && (
            <>
              <div style={{ fontSize: 13, color: "#d0d0e8", lineHeight: 1.7, marginBottom: 12 }}>
                {config.why}
              </div>
              {config.actions?.length ? (
                <>
                  <div style={S.sec}>What you can do here</div>
                  {config.actions.map((a, i) => (
                    <div key={i} style={S.action}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "#a78bfa", marginBottom: 3 }}>
                        {a.label}
                      </div>
                      <div style={{ fontSize: 11, color: "#8b8ba8" }}>{a.desc}</div>
                    </div>
                  ))}
                </>
              ) : null}
            </>
          )}
          {tab === "howto" && (
            <>
              <div style={S.sec}>Step by step</div>
              {config.howTo.map((s, i) => (
                <div key={i} style={S.step}>
                  <div style={S.num}>{i + 1}</div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#f0f0ff", marginBottom: 2 }}>
                      {s.step}
                    </div>
                    <div style={{ fontSize: 11, color: "#8b8ba8", lineHeight: 1.5 }}>{s.detail}</div>
                  </div>
                </div>
              ))}
            </>
          )}
          {tab === "tips" && (
            <>
              <div style={S.sec}>Pro tips</div>
              {config.tips.map((t, i) => (
                <div key={i} style={S.tip}>
                  <span style={{ color: "#6366f1", flexShrink: 0 }}>→</span>{t}
                </div>
              ))}
            </>
          )}
          {tab === "faq" && config.faq && (
            <>
              <div style={S.sec}>Frequently asked</div>
              {config.faq.map((f, i) => (
                <div key={i}>
                  <div style={S.faqQ}>{f.q}</div>
                  <div style={S.faqA}>{f.a}</div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </>
  );
}
