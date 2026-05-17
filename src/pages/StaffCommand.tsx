import AnimatedBg from "@/components/AnimatedBg";
import ThemeToggle from "@/components/ThemeToggle";
import PortalNav from '@/components/PortalNav';
import { useProject } from '@/contexts/ProjectContext';
import React,{useState,useEffect,useCallback} from "react";
const post=(a:string,b:any={})=>fetch("/api/task-engine",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:a,...b})}).then(r=>r.json()).catch(()=>({}));
const ROLES:any={hod:{c:"#dc2626",l:"HOD"},sales_manager:{c:"#f59e0b",l:"Sales Mgr"},bdm:{c:"#6366f1",l:"BDM"},bde:{c:"#10b981",l:"BDE"},pm:{c:"#06b6d4",l:"PM"}};
const STAGES=["new","contacted","demo_sent","proposal_sent","negotiating","won","lost","nurture"];
const STAGE_C:any={new:"var(--text-muted)",contacted:"#6366f1",demo_sent:"#8b5cf6",proposal_sent:"#a78bfa",negotiating:"#f59e0b",won:"#10b981",lost:"#ef4444",nurture:"#06b6d4"};
export default function StaffCommand(){
  const { selectedProjectId: projectId } = useProject();
  const[tab,setTab]=useState<"overview"|"pipeline"|"team"|"staff">("overview");
  const[staff,setStaff]=useState<any[]>([]);
  const[pipeline,setPipeline]=useState<any>({});
  const[assignments,setAssignments]=useState<any[]>([]);
  const[performance,setPerformance]=useState<any[]>([]);
  const[loading,setLoading]=useState(true);
  const[perfPeriod,setPerfPeriod]=useState("week");
  const[addingStaff,setAdding]=useState(false);
  const[newStaff,setNew]=useState({name:"",email:"",role:"bde",timezone:"Europe/London"});
  const[editPerms,setEditPerms]=useState<string|null>(null);
  const[permsData,setPermsData]=useState<any>({});
  const loadAll=useCallback(async()=>{
    setLoading(true);
    const[s,p,perf]=await Promise.all([
      post("get_staff"),
      post("get_pipeline",{role:"hod"}),
      post("get_team_performance",{period:perfPeriod}),
    ]);
    setStaff((s as any).staff||[]);
    setPipeline((p as any).pipeline||{});
    setAssignments((p as any).assignments||[]);
    setPerformance((perf as any).performance||[]);
    setLoading(false);
  },[perfPeriod]);
  useEffect(()=>{loadAll();},[loadAll]);
  async function createStaff(){
    if(!newStaff.name)return;
    await post("create_staff",newStaff);
    setAdding(false); setNew({name:"",email:"",role:"bde",timezone:"Europe/London"});
    loadAll();
  }
  async function savePerms(){
    await post("update_staff_permissions",{staffId:editPerms,permissions:permsData});
    setEditPerms(null); loadAll();
  }
  const S:any={
    root:{minHeight:"100vh",background:"var(--bg)",color:"var(--text)",fontFamily:"-apple-system,var(--font-display)"},
    hdr:{background:"var(--bg-deep)",borderBottom:"0.5px solid #1a1a3a",height:52,padding:"0 20px",
      position:"sticky" as const,top:0,zIndex:100,display:"flex",alignItems:"center",justifyContent:"space-between"},
    tabs:{display:"flex",background:"var(--bg-deep)",borderBottom:"0.5px solid #1a1a3a",padding:"0 20px"},
    tab:{padding:"9px 14px",fontSize:12,fontWeight:500,cursor:"pointer",border:"none",
      background:"transparent",color:"var(--text-sub)",borderBottom:"2px solid transparent"},
    tabA:{color:"#a78bfa",borderBottom:"2px solid #a78bfa"},
    body:{padding:"16px 20px"},
    card:{background:"var(--bg-card)",border:"0.5px solid #1a1a3a",borderRadius:12,padding:16,marginBottom:10},
    badge:(c:string)=>({fontSize:9,fontWeight:700,padding:"2px 7px",borderRadius:20,background:`${c}18`,color:c,border:`0.5px solid ${c}30`}),
    inp:{background:"var(--bg)",border:"0.5px solid #1a1a3a",borderRadius:8,color:"var(--text)",padding:"8px 12px",fontSize:12,outline:"none"},
    sel:{background:"var(--bg-card)",border:"0.5px solid #1a1a3a",borderRadius:8,color:"var(--text)",padding:"8px 12px",fontSize:12},
    btn:(c:string="#6366f1")=>({background:`${c}18`,border:`0.5px solid ${c}40`,borderRadius:8,color:c,padding:"7px 14px",fontSize:11,fontWeight:600,cursor:"pointer"}),
    sec:{fontSize:10,fontWeight:600,letterSpacing:1.2,textTransform:"uppercase" as const,color:"var(--text-muted)",marginBottom:8,marginTop:12},
  };
  if(loading)return<div style={{...S.root,display:"flex",alignItems:"center",justifyContent:"center",color:"var(--text-muted)"}}>Loading command center...</div>;
  const totalPipelineValue=assignments.reduce((s:number,a:any)=>s+(a.deal_value||0),0);
  const hotLeads=assignments.filter((a:any)=>a.priority==="hot");
  const stalling=assignments.filter((a:any)=>{
    const lc=a.last_contact?new Date(a.last_contact):null;
    return lc&&Date.now()-lc.getTime()>3*864e5&&!["won","lost"].includes(a.stage);
  });
  return(
    <div style={S.root}>
      <PortalNav />
      
      <div style={S.hdr}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <div style={{width:8,height:8,borderRadius:"50%",background:"#dc2626",boxShadow:"0 0 8px #dc2626"}}/>
          <span style={{fontSize:15,fontWeight:700}}>👑 HOD Command Center</span>
          <span style={S.badge("#dc2626")}>HEAD OF DEPARTMENT</span>
        </div>
        <button style={S.btn()} onClick={loadAll}>↻ Refresh</button>
      </div>
      <div style={S.tabs}>
        {([["overview","📊 Overview"],["pipeline","🔥 Pipeline"],["team","👥 Team Performance"],["staff","⚙️ Staff Management"]] as [typeof tab,string][]).map(([id,l])=>(
          <button key={id} style={{...S.tab,...(tab===id?S.tabA:{})}} onClick={()=>setTab(id)}>{l}</button>
        ))}
      </div>
      <div style={S.body}>

        {tab==="overview"&&(
          <div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:10,marginBottom:16}}>
              {[
                {v:staff.length,l:"Staff Members",c:"#a78bfa"},
                {v:assignments.length,l:"Total Leads",c:"#6366f1"},
                {v:assignments.filter((a:any)=>a.stage==="won").length,l:"Won",c:"#10b981"},
                {v:hotLeads.length,l:"Hot Leads",c:"#ef4444"},
                {v:stalling.length,l:"Stalling",c:"#f59e0b"},
                {v:`$${(totalPipelineValue/1000).toFixed(1)}k`,l:"Pipeline Value",c:"#06b6d4"},
              ].map(t=>(
                <div key={t.l} style={S.card}>
                  <div style={{fontSize:22,fontWeight:700,color:t.c,fontFamily:"monospace",lineHeight:1,marginBottom:3}}>{t.v}</div>
                  <div style={{fontSize:9,color:"var(--text-muted)",textTransform:"uppercase",letterSpacing:.8}}>{t.l}</div>
                </div>
              ))}
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              <div style={S.card}>
                <div style={S.sec}>🔥 Hot Leads</div>
                {hotLeads.slice(0,5).map((a:any)=>(
                  <div key={a.id} style={{display:"flex",gap:8,padding:"7px 0",borderBottom:"0.5px solid #111128",alignItems:"center"}}>
                    <div style={{flex:1}}>
                      <div style={{fontSize:12,fontWeight:600}}>{a.prospects?.company||a.prospects?.name||a.prospects?.url||"Lead"}</div>
                      <div style={{fontSize:10,color:"var(--text-muted)"}}>{a.staff_members?.name||"Unassigned"} · {a.source}</div>
                    </div>
                    <span style={S.badge(STAGE_C[a.stage]||"var(--text-muted)")}>{a.stage}</span>
                  </div>
                ))}
                {!hotLeads.length&&<div style={{color:"var(--text-muted)",fontSize:12}}>No hot leads currently.</div>}
              </div>
              <div style={S.card}>
                <div style={S.sec}>⚠️ Stalling (no contact 3+ days)</div>
                {stalling.slice(0,5).map((a:any)=>(
                  <div key={a.id} style={{display:"flex",gap:8,padding:"7px 0",borderBottom:"0.5px solid #111128",alignItems:"center"}}>
                    <div style={{flex:1}}>
                      <div style={{fontSize:12,fontWeight:600}}>{a.prospects?.company||a.prospects?.url||"Lead"}</div>
                      <div style={{fontSize:10,color:"#f59e0b"}}>{a.staff_members?.name} · Stage: {a.stage}</div>
                    </div>
                    <span style={S.badge("#f59e0b")}>{a.stage}</span>
                  </div>
                ))}
                {!stalling.length&&<div style={{color:"var(--text-muted)",fontSize:12}}>No stalling leads. ✓</div>}
              </div>
            </div>
            <div style={S.card}>
              <div style={S.sec}>Pipeline by Stage</div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap" as const}}>
                {STAGES.map(s=>(
                  <div key={s} style={{background:"var(--bg)",borderRadius:8,padding:"8px 12px",minWidth:80,textAlign:"center" as const}}>
                    <div style={{fontSize:16,fontWeight:700,color:STAGE_C[s],fontFamily:"monospace"}}>{pipeline.by_stage?.[s]||0}</div>
                    <div style={{fontSize:9,color:"var(--text-muted)",textTransform:"capitalize"}}>{s.replace(/_/g," ")}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab==="pipeline"&&(
          <div>
            <div style={{fontSize:12,color:"var(--text-sub)",marginBottom:12}}>{assignments.length} total leads across all BDEs</div>
            {assignments.map((a:any)=>(
              <div key={a.id} style={{...S.card,borderLeft:`3px solid ${STAGE_C[a.stage]||"var(--border)"}`}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                  <div>
                    <div style={{fontSize:13,fontWeight:700,color:"var(--text)"}}>{a.prospects?.company||a.prospects?.name||a.prospects?.url||"Lead"}</div>
                    <div style={{display:"flex",gap:6,marginTop:4,flexWrap:"wrap" as const}}>
                      <span style={S.badge(STAGE_C[a.stage]||"var(--text-muted)")}>{a.stage?.replace(/_/g," ").toUpperCase()}</span>
                      <span style={S.badge(a.priority==="hot"?"#ef4444":a.priority==="high"?"#f59e0b":"var(--text-muted)")}>{a.priority?.toUpperCase()}</span>
                      <span style={S.badge("#6366f1")}>{a.source}</span>
                      {a.staff_members&&<span style={{fontSize:10,color:"var(--text-sub)"}}>→ {a.staff_members.name}</span>}
                    </div>
                    {a.notes&&<div style={{fontSize:11,color:"var(--text-sub)",marginTop:4}}>{a.notes.slice(0,80)}</div>}
                  </div>
                  <div style={{textAlign:"right" as const}}>
                    {a.deal_value&&<div style={{fontSize:13,fontWeight:700,color:"#10b981",fontFamily:"monospace"}}>${a.deal_value}</div>}
                    {a.conversion_probability&&<div style={{fontSize:10,color:"var(--text-muted)"}}>{a.conversion_probability}% likely</div>}
                    {a.last_contact&&<div style={{fontSize:9,color:"var(--text-muted)",marginTop:2}}>
                      Last: {new Date(a.last_contact).toLocaleDateString("en-GB")}
                    </div>}
                  </div>
                </div>
              </div>
            ))}
            {!assignments.length&&<div style={{color:"var(--text-muted)",textAlign:"center",padding:40}}>No assignments yet. BDEs need to be assigned leads.</div>}
          </div>
        )}

        {tab==="team"&&(
          <div>
            <div style={{display:"flex",gap:8,marginBottom:14}}>
              {["week","month","day"].map(p=>(
                <button key={p} style={S.btn(perfPeriod===p?"#a78bfa":"var(--text-muted)")} onClick={()=>setPerfPeriod(p)}>
                  {p.charAt(0).toUpperCase()+p.slice(1)}
                </button>
              ))}
            </div>
            {performance.sort((a:any,b:any)=>b.conversion_rate-a.conversion_rate).map((p:any,idx:number)=>(
              <div key={p.staff_id} style={{...S.card,borderLeft:`3px solid ${ROLES[p.role]?.c||"var(--border)"}`}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                  <div style={{display:"flex",alignItems:"center",gap:10}}>
                    <div style={{width:32,height:32,borderRadius:"50%",background:`${ROLES[p.role]?.c||"#6366f1"}20`,
                      border:`1px solid ${ROLES[p.role]?.c||"#6366f1"}40`,display:"flex",alignItems:"center",
                      justifyContent:"center",fontSize:11,fontWeight:700,color:ROLES[p.role]?.c||"#6366f1"}}>
                      #{idx+1}
                    </div>
                    <div>
                      <div style={{fontSize:13,fontWeight:700,color:"var(--text)"}}>{p.name}</div>
                      <span style={S.badge(ROLES[p.role]?.c||"var(--text-muted)")}>{ROLES[p.role]?.l||p.role}</span>
                    </div>
                  </div>
                  <div style={{fontSize:20,fontWeight:700,color:p.conversion_rate>=50?"#10b981":p.conversion_rate>=25?"#f59e0b":"#ef4444",fontFamily:"monospace"}}>
                    {p.conversion_rate}%
                  </div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8}}>
                  {[["Leads",p.leads_handled,"#6366f1"],["Won",p.leads_won,"#10b981"],["Pipeline",`$${((p.pipeline_value||0)/1000).toFixed(1)}k`,"#06b6d4"],["Activity",p.activity_count,"#a78bfa"]].map(([l,v,c])=>(
                    <div key={l} style={{background:"var(--bg)",borderRadius:6,padding:"6px 10px",textAlign:"center" as const}}>
                      <div style={{fontSize:13,fontWeight:700,color:c,fontFamily:"monospace"}}>{v}</div>
                      <div style={{fontSize:9,color:"var(--text-muted)",textTransform:"uppercase"}}>{l}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {tab==="staff"&&(
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
              <div style={{fontSize:13,color:"var(--text-sub)"}}>{staff.length} active staff members</div>
              <button style={S.btn("#10b981")} onClick={()=>setAdding(!addingStaff)}>+ Add Staff Member</button>
            </div>
            {addingStaff&&(
              <div style={{...S.card,borderColor:"rgba(16,185,129,.25)"}}>
                <div style={S.sec}>New Staff Member</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:8,marginBottom:10}}>
                  <input style={S.inp} value={newStaff.name} onChange={e=>setNew({...newStaff,name:e.target.value})} placeholder="Full name *"/>
                  <input style={S.inp} value={newStaff.email} onChange={e=>setNew({...newStaff,email:e.target.value})} placeholder="Email"/>
                  <select style={S.sel} value={newStaff.role} onChange={e=>setNew({...newStaff,role:e.target.value})}>
                    {["hod","sales_manager","bdm","bde","pm","qa"].map(r=><option key={r} value={r}>{r.toUpperCase()}</option>)}
                  </select>
                  <select style={S.sel} value={newStaff.timezone} onChange={e=>setNew({...newStaff,timezone:e.target.value})}>
                    {["Europe/London","Asia/Kolkata","America/New_York","Asia/Dubai","Asia/Singapore","Australia/Sydney"].map(tz=><option key={tz} value={tz}>{tz.split("/")[1]}</option>)}
                  </select>
                </div>
                <div style={{display:"flex",gap:8}}>
                  <button style={S.btn("#10b981")} onClick={createStaff}>Create</button>
                  <button style={S.btn("var(--text-muted)")} onClick={()=>setAdding(false)}>Cancel</button>
                </div>
              </div>
            )}
            {staff.map((s:any)=>(
              <div key={s.id} style={S.card}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                  <div style={{display:"flex",alignItems:"center",gap:12}}>
                    <div style={{width:38,height:38,borderRadius:"50%",background:`${ROLES[s.role]?.c||"#6366f1"}20`,
                      border:`1px solid ${ROLES[s.role]?.c||"#6366f1"}40`,display:"flex",alignItems:"center",
                      justifyContent:"center",fontSize:12,fontWeight:700,color:ROLES[s.role]?.c||"#6366f1"}}>
                      {s.avatar_initials||s.name.slice(0,2).toUpperCase()}
                    </div>
                    <div>
                      <div style={{fontSize:13,fontWeight:700,color:"var(--text)"}}>{s.name}</div>
                      <div style={{display:"flex",gap:6,marginTop:3}}>
                        <span style={S.badge(ROLES[s.role]?.c||"var(--text-muted)")}>{ROLES[s.role]?.l||s.role}</span>
                        {s.email&&<span style={{fontSize:10,color:"var(--text-muted)"}}>{s.email}</span>}
                        <span style={{fontSize:10,color:"var(--text-muted)"}}>{s.timezone?.split("/")[1]||s.timezone}</span>
                      </div>
                    </div>
                  </div>
                  <div style={{display:"flex",gap:6,alignItems:"center"}}>
                    {s.live_stats&&(
                      <div style={{display:"flex",gap:8,marginRight:8}}>
                        {[["Leads",s.live_stats.total_leads],["Won",s.live_stats.won_leads],["Rate",`${s.live_stats.conversion_rate}%`]].map(([l,v])=>(
                          <div key={l} style={{background:"var(--bg)",borderRadius:6,padding:"4px 8px",textAlign:"center" as const}}>
                            <div style={{fontSize:11,fontWeight:700,fontFamily:"monospace",color:"var(--text)"}}>{v}</div>
                            <div style={{fontSize:8,color:"var(--text-muted)",textTransform:"uppercase"}}>{l}</div>
                          </div>
                        ))}
                      </div>
                    )}
                    <button style={S.btn("#a78bfa")} onClick={()=>{setEditPerms(s.id);setPermsData(s.permissions||{});}}>
                      ⚙ Permissions
                    </button>
                  </div>
                </div>
                {editPerms===s.id&&(
                  <div style={{marginTop:12,padding:"12px",background:"var(--bg)",borderRadius:8,border:"0.5px solid rgba(167,139,250,.2)"}}>
                    <div style={S.sec}>Toggle Permissions</div>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:8,marginBottom:10}}>
                      {["can_see_all_leads","can_access_brain","can_generate_reports","can_manage_templates",
                        "can_see_analytics","can_see_all_projects","can_see_financials","can_instant_audit",
                        "can_run_competitor_research","can_generate_proposals","can_create_presentations","can_use_ai_responses"
                      ].map(perm=>(
                        <label key={perm} style={{display:"flex",gap:8,alignItems:"center",cursor:"pointer",padding:"4px 0"}}>
                          <input type="checkbox" checked={!!permsData[perm]}
                            onChange={e=>setPermsData({...permsData,[perm]:e.target.checked})}
                            style={{accentColor:"#6366f1"}}/>
                          <span style={{fontSize:11,color:"#d0d0e8"}}>{perm.replace(/can_|_/g," ").trim()}</span>
                        </label>
                      ))}
                    </div>
                    <div style={{display:"flex",gap:8}}>
                      <button style={S.btn("#10b981")} onClick={savePerms}>Save</button>
                      <button style={S.btn("var(--text-muted)")} onClick={()=>setEditPerms(null)}>Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  </div>
  );
}