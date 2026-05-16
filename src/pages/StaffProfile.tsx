import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useParams, useNavigate } from "react-router-dom";

const post = (a: string, b: any = {}) =>
  fetch("/api/task-engine", { method:"POST", headers:{"Content-Type":"application/json"},
    body: JSON.stringify({action:a,...b}) }).then(r=>r.json()).catch(()=>({}));

const ROLE_META: any = {
  hod:           { label:"Head of Department", color:"#dc2626", icon:"👑", bg:"rgba(220,38,38,.1)" },
  sales_manager: { label:"Sales Manager",       color:"#f59e0b", icon:"📊", bg:"rgba(245,158,11,.1)" },
  bdm:           { label:"Business Dev Manager",color:"#6366f1", icon:"🎯", bg:"rgba(99,102,241,.1)" },
  bde:           { label:"Business Dev Exec",   color:"#10b981", icon:"💼", bg:"rgba(16,185,129,.1)" },
  pm:            { label:"Project Manager",     color:"#06b6d4", icon:"🗂",  bg:"rgba(6,182,212,.1)"  },
  qa:            { label:"Quality Assurance",   color:"#8b5cf6", icon:"✅", bg:"rgba(139,92,246,.1)" },
};

export default function StaffProfile() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [staff, setStaff]     = useState<any>(null);
  const [allStaff, setAll]    = useState<any[]>([]);
  const [perf, setPerf]       = useState<any>(null);
  const [assignments, setAss] = useState<any[]>([]);
  const [messages, setMsgs]   = useState<any[]>([]);
  const [newMsg, setNewMsg]   = useState("");
  const [dept, setDept]       = useState("general");
  const [sending, setSending] = useState(false);
  const [tab, setTab]         = useState<"overview"|"pipeline"|"chat"|"settings">("overview");

  useEffect(() => {
    post("get_staff").then(r => {
      const s = (r as any).staff || [];
      setAll(s);
      const found = id ? s.find((x: any) => x.id === id) : s[0];
      if (found) setStaff(found);
    });
    loadMessages();
  }, [id]);

  useEffect(() => {
    if (!staff) return;
    post("get_pipeline", { staffId: staff.id, role: staff.role })
      .then(r => setAss((r as any).assignments || []));
    post("get_team_performance", { period: "month" })
      .then(r => {
        const p = ((r as any).performance || []).find((x: any) => x.staff_id === staff.id);
        setPerf(p);
      });
  }, [staff]);

  async function loadMessages() {
    try {
      const { data } = await supabase
        .from("internal_messages")
        .select("*")
        .eq("dept", dept)
        .order("created_at", { ascending: false })
        .limit(50);
      setMsgs((data || []).reverse() as any[]);
    } catch {}
  }

  async function sendMessage() {
    if (!newMsg.trim() || !staff) return;
    setSending(true);
    try {
      await supabase.from("internal_messages").insert({
        dept, sender_id: staff.id, sender_name: staff.name,
        sender_role: staff.role, body: newMsg.trim(), msg_type: "text",
      });
      setNewMsg(""); await loadMessages();
    } catch {}
    setSending(false);
  }

  useEffect(() => { loadMessages(); }, [dept]);

  if (!staff) return (
    <div style={{ minHeight:"100vh", background:"#06060e", color:"#e8e8f8",
      fontFamily:"system-ui", display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ color:"#4b4b6a" }}>Loading profile...</div>
    </div>
  );

  const meta = ROLE_META[staff.role] || ROLE_META.bde;
  const initials = staff.avatar_initials || staff.name.split(" ").map((n:string)=>n[0]).join("").slice(0,2).toUpperCase();
  const won = assignments.filter((a:any) => a.stage === "won").length;
  const active = assignments.filter((a:any) => !["won","lost"].includes(a.stage)).length;
  const pipelineValue = assignments.reduce((s:number,a:any)=>s+(a.deal_value||0), 0);

  const S: any = {
    root: { minHeight:"100vh", background:"#06060e", color:"#e8e8f8", fontFamily:"-apple-system,'SF Pro Display',system-ui,sans-serif" },
    hdr: { background:"#09091a", borderBottom:"0.5px solid #1a1a3a", padding:"0 20px",
      height:52, display:"flex", alignItems:"center", justifyContent:"space-between",
      position:"sticky" as const, top:0, zIndex:100 },
    body: { maxWidth:1000, margin:"0 auto", padding:"20px" },
    card: { background:"#0d0d1e", border:"0.5px solid #1a1a3a", borderRadius:12, padding:16, marginBottom:12 },
    tab_: { padding:"9px 14px", fontSize:12, fontWeight:500, cursor:"pointer", border:"none",
      background:"transparent", color:"#8b8ba8", borderBottom:"2px solid transparent" },
    tabA: { color:"#a78bfa", borderBottom:"2px solid #a78bfa" },
    inp: { background:"#070710", border:"0.5px solid #1a1a3a", borderRadius:8, color:"#e8e8f8",
      padding:"9px 12px", fontSize:12, outline:"none" },
    btn: (c:string="#6366f1") => ({ background:`${c}18`, border:`0.5px solid ${c}40`,
      borderRadius:8, color:c, padding:"7px 14px", fontSize:11, fontWeight:600, cursor:"pointer" }),
    sec: { fontSize:10, fontWeight:600, letterSpacing:1.2, textTransform:"uppercase" as const,
      color:"#4b4b6a", marginBottom:8, marginTop:12 },
    badge: (c:string) => ({ fontSize:9, fontWeight:700, padding:"2px 7px", borderRadius:20,
      background:`${c}18`, color:c }),
  };

  const DEPTS = [
    { key:"general", label:"🏠 General" },
    { key:"sales", label:"💰 Sales" },
    { key:"delivery", label:"🚀 Delivery" },
    { key:"leadership", label:"👑 Leadership" },
    { key:"bde", label:"💼 BDE Team" },
    { key:"alerts", label:"🚨 Alerts" },
  ];

  const msgColors: any = { hod:"#dc2626", sales_manager:"#f59e0b", bdm:"#6366f1", bde:"#10b981", pm:"#06b6d4" };

  return (
    <div style={S.root}>
      {/* Header */}
      <div style={S.hdr}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <button onClick={()=>navigate(-1)} style={{ background:"none", border:"none", color:"#4b4b6a", cursor:"pointer", fontSize:18 }}>←</button>
          <span style={{ fontSize:14, fontWeight:600 }}>Staff Profile</span>
        </div>
        {/* Staff switcher */}
        <div style={{ display:"flex", gap:6, alignItems:"center" }}>
          <span style={{ fontSize:11, color:"#4b4b6a" }}>View:</span>
          {allStaff.slice(0,6).map((s:any) => (
            <button key={s.id} onClick={() => navigate(`/profile/${s.id}`)}
              title={s.name}
              style={{ width:28, height:28, borderRadius:"50%", border:`1px solid ${s.id===staff.id?ROLE_META[s.role]?.color||"#6366f1":"#1a1a3a"}`,
                background: s.id===staff.id ? `${ROLE_META[s.role]?.color||"#6366f1"}20` : "#0d0d1e",
                color: ROLE_META[s.role]?.color||"#6366f1", fontSize:10, fontWeight:700, cursor:"pointer" }}>
              {s.avatar_initials||s.name[0]}
            </button>
          ))}
          <a href="/staff-command" style={{ ...S.btn(), textDecoration:"none", marginLeft:4 }}>Team View</a>
        </div>
      </div>

      <div style={S.body}>
        {/* Profile hero */}
        <div style={{ ...S.card, background:`linear-gradient(135deg,${meta.bg},#0d0d1e)`,
          borderColor: `${meta.color}30`, marginBottom:16 }}>
          <div style={{ display:"flex", gap:20, alignItems:"flex-start" }}>
            {/* Avatar */}
            <div style={{ width:72, height:72, borderRadius:"50%", background:meta.bg,
              border:`2px solid ${meta.color}50`, display:"flex", alignItems:"center",
              justifyContent:"center", fontSize:22, fontWeight:700, color:meta.color, flexShrink:0 }}>
              {initials}
            </div>
            {/* Info */}
            <div style={{ flex:1 }}>
              <div style={{ fontSize:20, fontWeight:700, color:"#f0f0ff", marginBottom:4 }}>{staff.name}</div>
              <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" as const, marginBottom:8 }}>
                <span style={{ ...S.badge(meta.color), fontSize:11, padding:"3px 10px" }}>
                  {meta.icon} {meta.label}
                </span>
                {staff.email && <span style={{ fontSize:12, color:"#4b4b6a" }}>{staff.email}</span>}
                <span style={{ fontSize:12, color:"#4b4b6a" }}>
                  🌍 {staff.timezone?.split("/")[1]?.replace("_"," ")||staff.timezone}
                </span>
                <span style={{ fontSize:11, color:staff.is_active?"#10b981":"#ef4444" }}>
                  {staff.is_active?"● Active":"○ Inactive"}
                </span>
              </div>
              {/* Key stats row */}
              <div style={{ display:"flex", gap:12, flexWrap:"wrap" as const }}>
                {[
                  { v: assignments.length, l:"Total Leads", c:"#6366f1" },
                  { v: won,                l:"Converted",   c:"#10b981" },
                  { v: active,             l:"Active",      c:"#a78bfa" },
                  { v: perf?.conversion_rate != null ? `${perf.conversion_rate}%` : "—", l:"Conv. Rate", c: (perf?.conversion_rate||0)>=30?"#10b981":(perf?.conversion_rate||0)>=20?"#f59e0b":"#ef4444" },
                  { v: `$${(pipelineValue/1000).toFixed(1)}k`, l:"Pipeline", c:"#06b6d4" },
                ].map(t=>(
                  <div key={t.l} style={{ background:"rgba(0,0,0,.2)", borderRadius:8, padding:"8px 14px", minWidth:70 }}>
                    <div style={{ fontSize:18, fontWeight:700, color:t.c, fontFamily:"monospace", lineHeight:1 }}>{t.v}</div>
                    <div style={{ fontSize:9, color:"#4b4b6a", textTransform:"uppercase", marginTop:2 }}>{t.l}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display:"flex", borderBottom:"0.5px solid #1a1a3a", marginBottom:14 }}>
          {([["overview","📊 Overview"],["pipeline","🔥 Pipeline"],["chat","💬 Dept Chat"],["settings","⚙️ Settings"]] as [typeof tab,string][]).map(([id,l])=>(
            <button key={id} style={{...S.tab_,...(tab===id?S.tabA:{})}} onClick={()=>setTab(id)}>{l}</button>
          ))}
        </div>

        {/* OVERVIEW TAB */}
        {tab==="overview" && (
          <div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
              {/* Performance this month */}
              <div style={S.card}>
                <div style={S.sec}>📈 Performance (This Month)</div>
                {perf ? (
                  <div>
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:10 }}>
                      {[
                        ["Leads Handled", perf.leads_handled||0, "#6366f1"],
                        ["Won",           perf.leads_won||0,     "#10b981"],
                        ["Conv. Rate",    `${perf.conversion_rate||0}%`, (perf.conversion_rate||0)>=25?"#10b981":"#f59e0b"],
                        ["Activity",      perf.activity_count||0, "#a78bfa"],
                      ].map(([l,v,c])=>(
                        <div key={l} style={{ background:"#070710", borderRadius:8, padding:"10px 12px" }}>
                          <div style={{ fontSize:18, fontWeight:700, color:c as string, fontFamily:"monospace" }}>{v}</div>
                          <div style={{ fontSize:9, color:"#4b4b6a", textTransform:"uppercase" }}>{l}</div>
                        </div>
                      ))}
                    </div>
                    {/* Conversion bar */}
                    <div style={S.sec}>Conversion Rate</div>
                    <div style={{ height:8, background:"#1a1a3a", borderRadius:4, overflow:"hidden", marginBottom:4 }}>
                      <div style={{ height:"100%",
                        width:`${Math.min(perf.conversion_rate||0,100)}%`,
                        background:`linear-gradient(90deg,#6366f1,${(perf.conversion_rate||0)>=25?"#10b981":"#f59e0b"})`,
                        borderRadius:4, transition:"width .5s" }}/>
                    </div>
                    <div style={{ fontSize:11, color:"#4b4b6a" }}>
                      Target: {staff.targets?.conversion_rate||25}% · Current: {perf.conversion_rate||0}%
                    </div>
                  </div>
                ) : (
                  <div style={{ color:"#4b4b6a", fontSize:12 }}>No performance data yet this month.</div>
                )}
              </div>

              {/* Targets */}
              <div style={S.card}>
                <div style={S.sec}>🎯 Targets & Goals</div>
                {staff.targets && Object.keys(staff.targets).length > 0 ? (
                  Object.entries(staff.targets).map(([k,v]:any) => (
                    <div key={k} style={{ display:"flex", justifyContent:"space-between", padding:"6px 0",
                      borderBottom:"0.5px solid #111128" }}>
                      <div style={{ fontSize:12, color:"#d0d0e8" }}>{k.replace(/_/g," ")}</div>
                      <div style={{ fontSize:12, fontWeight:700, color:"#a78bfa", fontFamily:"monospace" }}>{v}</div>
                    </div>
                  ))
                ) : (
                  <div style={{ color:"#4b4b6a", fontSize:12 }}>No targets set. Edit in Settings.</div>
                )}

                <div style={{ ...S.sec, marginTop:16 }}>⚡ Permissions</div>
                {staff.permissions && Object.entries(staff.permissions).filter(([,v])=>v).map(([k]:any) => (
                  <div key={k} style={{ fontSize:11, color:"#10b981", padding:"2px 0" }}>
                    ✓ {k.replace(/can_|_/g," ").trim()}
                  </div>
                ))}
                {(!staff.permissions || Object.values(staff.permissions).filter(Boolean).length === 0) &&
                  <div style={{ color:"#4b4b6a", fontSize:12 }}>Default role permissions active.</div>}
              </div>
            </div>

            {/* Recent activity */}
            <div style={S.card}>
              <div style={S.sec}>⏱ Recent Pipeline</div>
              {assignments.slice(0,5).map((a:any)=>(
                <div key={a.id} style={{ display:"flex", gap:8, padding:"7px 0", borderBottom:"0.5px solid #111128", alignItems:"center" }}>
                  <div style={{ width:8, height:8, borderRadius:"50%", flexShrink:0,
                    background: a.stage==="won"?"#10b981":a.stage==="lost"?"#ef4444":a.priority==="hot"?"#f59e0b":"#6366f1" }}/>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:12, color:"#f0f0ff" }}>{a.prospects?.company||a.prospects?.url||"Lead"}</div>
                    <div style={{ fontSize:10, color:"#4b4b6a" }}>{a.stage} · {a.source}</div>
                  </div>
                  {a.deal_value&&<div style={{ fontSize:11, color:"#10b981", fontFamily:"monospace" }}>${a.deal_value}</div>}
                </div>
              ))}
              {!assignments.length && <div style={{ color:"#4b4b6a", fontSize:12 }}>No leads assigned yet.</div>}
            </div>
          </div>
        )}

        {/* PIPELINE TAB */}
        {tab==="pipeline" && (
          <div>
            <div style={{ fontSize:12, color:"#8b8ba8", marginBottom:10 }}>
              {assignments.length} total · {active} active · {won} won · ${(pipelineValue/1000).toFixed(1)}k value
            </div>
            {assignments.map((a:any) => (
              <div key={a.id} style={{ ...S.card,
                borderLeft:`3px solid ${a.stage==="won"?"#10b981":a.stage==="lost"?"#ef4444":a.priority==="hot"?"#f59e0b":"#6366f1"}` }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                  <div>
                    <div style={{ fontSize:13, fontWeight:700 }}>{a.prospects?.company||a.prospects?.url||"Lead"}</div>
                    <div style={{ display:"flex", gap:6, marginTop:4 }}>
                      <span style={S.badge(a.stage==="won"?"#10b981":a.stage==="lost"?"#ef4444":"#6366f1")}>
                        {a.stage?.toUpperCase()}
                      </span>
                      <span style={S.badge(a.priority==="hot"?"#ef4444":a.priority==="high"?"#f59e0b":"#4b4b6a")}>
                        {a.priority?.toUpperCase()}
                      </span>
                      <span style={{ fontSize:10, color:"#4b4b6a" }}>{a.source}</span>
                    </div>
                    {a.notes&&<div style={{ fontSize:11, color:"#8b8ba8", marginTop:4 }}>{a.notes.slice(0,80)}</div>}
                  </div>
                  <div style={{ textAlign:"right" as const }}>
                    {a.deal_value&&<div style={{ fontSize:14, fontWeight:700, color:"#10b981", fontFamily:"monospace" }}>${a.deal_value}</div>}
                    {a.conversion_probability&&<div style={{ fontSize:10, color:"#4b4b6a" }}>{a.conversion_probability}% likely</div>}
                  </div>
                </div>
                {a.conversion_probability && (
                  <div style={{ height:3, background:"#1a1a3a", borderRadius:2, marginTop:8, overflow:"hidden" }}>
                    <div style={{ height:"100%", width:`${a.conversion_probability}%`,
                      background:a.conversion_probability>=60?"#10b981":a.conversion_probability>=40?"#f59e0b":"#ef4444",
                      transition:"width .3s" }}/>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* CHAT TAB */}
        {tab==="chat" && (
          <div>
            {/* Dept selector */}
            <div style={{ display:"flex", gap:6, marginBottom:12, overflowX:"auto" as const }}>
              {DEPTS.map(d => (
                <button key={d.key} style={{ ...S.btn(dept===d.key?"#a78bfa":"#4b4b6a"),
                  borderColor:dept===d.key?"rgba(167,139,250,.4)":"#1a1a3a",
                  whiteSpace:"nowrap" as const }}
                  onClick={()=>setDept(d.key)}>
                  {d.label}
                </button>
              ))}
            </div>

            {/* Messages */}
            <div style={{ ...S.card, padding:0, overflow:"hidden" }}>
              <div style={{ padding:"12px 14px", borderBottom:"0.5px solid #1a1a3a",
                display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <div style={{ fontSize:12, fontWeight:600, color:"#f0f0ff" }}>
                  {DEPTS.find(d=>d.key===dept)?.label} Channel
                </div>
                <div style={{ fontSize:10, color:"#4b4b6a" }}>{messages.length} messages</div>
              </div>
              <div style={{ height:360, overflowY:"auto" as const, padding:"12px 14px", display:"flex",
                flexDirection:"column" as const, gap:8 }}>
                {messages.map((m:any) => {
                  const isMe = m.sender_id === staff.id;
                  const mColor = msgColors[m.sender_role] || "#6366f1";
                  return (
                    <div key={m.id} style={{ display:"flex", gap:8, alignItems:"flex-start",
                      flexDirection: isMe ? "row-reverse" as const : "row" as const }}>
                      <div style={{ width:28, height:28, borderRadius:"50%", flexShrink:0,
                        background:`${mColor}20`, border:`1px solid ${mColor}40`,
                        display:"flex", alignItems:"center", justifyContent:"center",
                        fontSize:10, fontWeight:700, color:mColor }}>
                        {(m.sender_name||"?").slice(0,2).toUpperCase()}
                      </div>
                      <div style={{ maxWidth:"70%" }}>
                        <div style={{ fontSize:10, color:"#4b4b6a", marginBottom:3,
                          textAlign: isMe ? "right" as const : "left" as const }}>
                          {isMe ? "You" : m.sender_name}
                          <span style={{ color:mColor, marginLeft:4 }}>
                            {ROLE_META[m.sender_role]?.icon}
                          </span>
                          <span style={{ marginLeft:6 }}>
                            {new Date(m.created_at).toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"})}
                          </span>
                        </div>
                        <div style={{ background: isMe ? "rgba(99,102,241,.15)" : "#0d0d1e",
                          border: `0.5px solid ${isMe?"rgba(99,102,241,.3)":"#1a1a3a"}`,
                          borderRadius: isMe ? "12px 12px 4px 12px" : "12px 12px 12px 4px",
                          padding:"8px 12px", fontSize:13, color:"#e8e8f8", lineHeight:1.5 }}>
                          {m.body}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {!messages.length && (
                  <div style={{ color:"#4b4b6a", textAlign:"center" as const, padding:40, fontSize:13 }}>
                    No messages in {dept} channel yet. Start the conversation.
                  </div>
                )}
              </div>
              {/* Input */}
              <div style={{ padding:"10px 14px", borderTop:"0.5px solid #1a1a3a",
                display:"flex", gap:8, alignItems:"center" }}>
                <input style={{ ...S.inp, flex:1 }} value={newMsg}
                  onChange={e=>setNewMsg(e.target.value)}
                  onKeyDown={e=>e.key==="Enter"&&!e.shiftKey&&sendMessage()}
                  placeholder={`Message #${dept}...`}/>
                <button style={S.btn()} onClick={sendMessage} disabled={sending||!newMsg.trim()}>
                  {sending?"...":"Send"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* SETTINGS TAB */}
        {tab==="settings" && (
          <div style={S.card}>
            <div style={S.sec}>Profile Settings</div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:12 }}>
              {[["Name",staff.name],["Email",staff.email||"—"],["Role",ROLE_META[staff.role]?.label],["Timezone",staff.timezone]].map(([l,v])=>(
                <div key={l}>
                  <div style={{ fontSize:10, color:"#4b4b6a", marginBottom:3 }}>{l}</div>
                  <div style={{ fontSize:13, color:"#f0f0ff", padding:"8px 12px", background:"#070710",
                    borderRadius:8, border:"0.5px solid #1a1a3a" }}>{v}</div>
                </div>
              ))}
            </div>
            <div style={{ fontSize:12, color:"#4b4b6a", marginTop:8 }}>
              To update profile details, contact your HOD or use the Staff Management panel at{" "}
              <a href="/staff-command" style={{ color:"#6366f1" }}>/staff-command</a>.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
