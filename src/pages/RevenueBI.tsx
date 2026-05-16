import React,{useState,useEffect,useCallback} from "react";
import AnimatedBg from "@/components/AnimatedBg";
import MetricCard from "@/components/MetricCard";
import ThemeToggle from "@/components/ThemeToggle";
import { BarChart,Bar,XAxis,YAxis,Tooltip,ResponsiveContainer,LineChart,Line,CartesianGrid } from "recharts";

const post=(a:string,b:any={})=>fetch("/api/task-engine",{method:"POST",
  headers:{"Content-Type":"application/json"},body:JSON.stringify({action:a,...b})}).then(r=>r.json()).catch(()=>({}));

export default function RevenueBI(){
  const[overview,setOverview]=useState<any>({});
  const[projects,setProjects]=useState<any[]>([]);
  const[pipeline,setPipeline]=useState<any>({});
  const[health,setHealth]=useState<any[]>([]);
  const[addingRev,setAddRev]=useState(false);
  const[newRev,setNewRev]=useState({projectId:"",amount:"",recordType:"monthly_retainer",notes:""});
  const[loading,setLoading]=useState(true);

  const load=useCallback(async()=>{
    setLoading(true);
    const[o,p,h]=await Promise.all([
      post("get_revenue_overview"),
      post("get_pipeline",{role:"hod"}),
      post("get_health_dashboard"),
    ]);
    setOverview(o);
    setPipeline((p as any).pipeline||{});
    setHealth((h as any).health||[]);
    import("@/lib/supabase").then(({supabase})=>{
      supabase.from("projects").select("id,name").limit(20).then(({data})=>setProjects(data||[]));
    });
    setLoading(false);
  },[]);

  useEffect(()=>{load();},[load]);

  async function addRecord(){
    if(!newRev.projectId||!newRev.amount)return;
    await post("add_revenue_record",{projectId:newRev.projectId,amount:parseFloat(newRev.amount),
      recordType:newRev.recordType,notes:newRev.notes});
    setAddRev(false); setNewRev({projectId:"",amount:"",recordType:"monthly_retainer",notes:""});
    load();
  }

  const chartData=(overview.monthlyTrend||[]).map(([k,v]:any)=>({month:k.slice(5),revenue:v}));
  const pipelineTotal=pipeline.total_value||0;
  const hotCount=pipeline.hot_leads?.length||0;

  const S:any={
    root:{minHeight:"100vh",background:"var(--bg)",color:"var(--text)",
      fontFamily:"-apple-system,'SF Pro Display',system-ui,sans-serif"},
    hdr:{background:"rgba(8,8,24,.92)",backdropFilter:"blur(20px)",
      borderBottom:"0.5px solid var(--border)",height:56,padding:"0 24px",
      position:"sticky" as const,top:0,zIndex:100,
      display:"flex",alignItems:"center",justifyContent:"space-between"},
    body:{maxWidth:1000,margin:"0 auto",padding:"24px 20px"},
    card:{background:"var(--bg-card)",border:"0.5px solid var(--border)",
      borderRadius:12,padding:18,marginBottom:12},
    inp:{background:"var(--bg-deep)",border:"0.5px solid var(--border)",borderRadius:8,
      color:"var(--text)",padding:"8px 12px",fontSize:12,outline:"none"},
    sel:{background:"var(--bg-card)",border:"0.5px solid var(--border)",borderRadius:8,
      color:"var(--text)",padding:"8px 12px",fontSize:12},
    btn:(c:string="var(--accent)")=>({background:`${c}`,border:"none",borderRadius:8,
      color:"#fff",padding:"8px 16px",fontSize:12,fontWeight:600,cursor:"pointer"}),
  };

  if(loading) return(
    <div style={{...S.root,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <AnimatedBg/>
      <div style={{zIndex:1,color:"var(--text-muted)"}}>Loading revenue data...</div>
    </div>
  );

  return(
    <div style={S.root} className="empire-page">
      <AnimatedBg/>
      <div style={{position:"relative",zIndex:1}}>
        <div style={S.hdr}>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <span style={{fontSize:18}}>💰</span>
            <div>
              <div style={{fontSize:14,fontWeight:700}}>Revenue & Business Intelligence</div>
              <div style={{fontSize:10,color:"var(--text-muted)",letterSpacing:"1px"}}>MRR · ARR · Pipeline · Forecast</div>
            </div>
          </div>
          <div style={{display:"flex",gap:10}}>
            <button style={{...S.btn("var(--accent)"),fontSize:11,padding:"6px 12px"}}
              onClick={()=>setAddRev(!addingRev)}>+ Add Revenue</button>
            <ThemeToggle compact/>
          </div>
        </div>

        <div style={S.body}>
          {/* Add revenue form */}
          {addingRev&&(
            <div style={{...S.card,borderColor:"rgba(16,185,129,.3)",marginBottom:16}}>
              <div style={{fontSize:12,fontWeight:600,marginBottom:10,color:"var(--text)"}}>Record Revenue</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 2fr auto",gap:8,alignItems:"end"}}>
                <div>
                  <div style={{fontSize:10,color:"var(--text-muted)",marginBottom:4}}>Project</div>
                  <select style={{...S.sel,width:"100%"}} value={newRev.projectId} onChange={e=>setNewRev({...newRev,projectId:e.target.value})}>
                    <option value="">Select...</option>
                    {projects.map((p:any)=><option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <div style={{fontSize:10,color:"var(--text-muted)",marginBottom:4}}>Amount (£)</div>
                  <input style={{...S.inp,width:"100%"}} type="number" value={newRev.amount}
                    onChange={e=>setNewRev({...newRev,amount:e.target.value})} placeholder="800"/>
                </div>
                <div>
                  <div style={{fontSize:10,color:"var(--text-muted)",marginBottom:4}}>Type</div>
                  <select style={{...S.sel,width:"100%"}} value={newRev.recordType} onChange={e=>setNewRev({...newRev,recordType:e.target.value})}>
                    <option value="monthly_retainer">Monthly Retainer</option>
                    <option value="one_time">One-time</option>
                    <option value="setup_fee">Setup Fee</option>
                    <option value="upsell">Upsell</option>
                  </select>
                </div>
                <div>
                  <div style={{fontSize:10,color:"var(--text-muted)",marginBottom:4}}>Notes</div>
                  <input style={{...S.inp,width:"100%"}} value={newRev.notes}
                    onChange={e=>setNewRev({...newRev,notes:e.target.value})} placeholder="Invoice #, notes..."/>
                </div>
                <button style={S.btn("var(--accent)")} onClick={addRecord}>Save</button>
              </div>
            </div>
          )}

          {/* KPI Cards */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:10,marginBottom:16}}>
            <MetricCard value={overview.mrr||0} label="MRR" prefix="£" icon="📅" animate
              sub="This month recurring"/>
            <MetricCard value={overview.arr||0} label="ARR" prefix="£" icon="📈" animate
              sub="Annual run rate"/>
            <MetricCard value={overview.totalPaid||0} label="Total Received" prefix="£" icon="✅" animate/>
            <MetricCard value={overview.pending||0} label="Pending" prefix="£" icon="⏳"
              color={overview.pending>0?"#f59e0b":undefined} animate/>
            <MetricCard value={overview.overdue||0} label="Overdue" prefix="£" icon="🚨"
              color={overview.overdue>0?"#ef4444":undefined} animate/>
            <MetricCard value={pipelineTotal} label="Pipeline Value" prefix="£" icon="🔥" animate/>
          </div>

          {/* Charts row */}
          <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:12,marginBottom:12}}>
            {chartData.length>0&&(
              <div style={S.card}>
                <div style={{fontSize:11,color:"var(--text-muted)",fontWeight:600,letterSpacing:"1px",
                  textTransform:"uppercase" as const,marginBottom:12}}>Revenue Trend</div>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)"/>
                    <XAxis dataKey="month" tick={{fontSize:10,fill:"var(--text-muted)"}}/>
                    <YAxis tick={{fontSize:10,fill:"var(--text-muted)"}} tickFormatter={v=>`£${(v/1000).toFixed(0)}k`}/>
                    <Tooltip contentStyle={{background:"var(--bg-card)",border:"0.5px solid var(--border)",
                      borderRadius:8,fontSize:12}} formatter={(v:any)=>[`£${v.toLocaleString()}`,""]}/>
                    <Bar dataKey="revenue" fill="var(--accent)" radius={[4,4,0,0]}/>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Pipeline funnel */}
            <div style={S.card}>
              <div style={{fontSize:11,color:"var(--text-muted)",fontWeight:600,letterSpacing:"1px",
                textTransform:"uppercase" as const,marginBottom:12}}>Pipeline Funnel</div>
              {[
                {stage:"new",label:"New Leads",color:"#4b4b6a"},
                {stage:"contacted",label:"Contacted",color:"#6366f1"},
                {stage:"proposal_sent",label:"Proposal Sent",color:"#a78bfa"},
                {stage:"negotiating",label:"Negotiating",color:"#f59e0b"},
                {stage:"won",label:"Won",color:"#10b981"},
              ].map(({stage,label,color})=>{
                const count=(pipeline.by_stage||{})[stage]||0;
                const max=Math.max(...Object.values(pipeline.by_stage||{1:1}) as number[]);
                return(
                  <div key={stage} style={{marginBottom:8}}>
                    <div style={{display:"flex",justifyContent:"space-between",
                      fontSize:11,color:"var(--text-sub)",marginBottom:3}}>
                      <span>{label}</span><span style={{color,fontWeight:700}}>{count}</span>
                    </div>
                    <div style={{height:6,background:"var(--border)",borderRadius:3,overflow:"hidden" as const}}>
                      <div style={{height:"100%",width:`${max?count/max*100:0}%`,
                        background:color,borderRadius:3,transition:"width .5s"}}/>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Client health vs revenue */}
          <div style={S.card}>
            <div style={{fontSize:11,color:"var(--text-muted)",fontWeight:600,letterSpacing:"1px",
              textTransform:"uppercase" as const,marginBottom:12}}>Client Health Overview</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:8}}>
              {health.map((h:any)=>(
                <div key={h.project_id} style={{background:"var(--bg-deep)",borderRadius:10,padding:"12px 14px",
                  border:`0.5px solid ${h.churn_risk==="high"?"rgba(239,68,68,.3)":h.upsell_signals?.length>0?"rgba(16,185,129,.2)":"var(--border)"}`}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                    <div style={{fontSize:12,fontWeight:600,color:"var(--text)"}}>{(h as any).projects?.name||"Project"}</div>
                    <div style={{fontSize:16,fontWeight:700,fontFamily:"monospace",
                      color:h.overall_score>=70?"#10b981":h.overall_score>=50?"var(--accent)":"#ef4444"}}>
                      {h.overall_score}
                    </div>
                  </div>
                  <div style={{height:4,background:"var(--border)",borderRadius:2,overflow:"hidden" as const,marginBottom:6}}>
                    <div style={{height:"100%",width:`${h.overall_score}%`,borderRadius:2,
                      background:h.overall_score>=70?"#10b981":h.overall_score>=50?"var(--accent)":"#ef4444",
                      transition:"width .6s"}}/>
                  </div>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap" as const}}>
                    <span style={{fontSize:9,fontWeight:700,padding:"2px 6px",borderRadius:20,
                      background:h.churn_risk==="low"?"rgba(16,185,129,.1)":h.churn_risk==="medium"?"rgba(245,158,11,.1)":"rgba(239,68,68,.1)",
                      color:h.churn_risk==="low"?"#10b981":h.churn_risk==="medium"?"#f59e0b":"#ef4444"}}>
                      {h.churn_risk?.toUpperCase()} RISK
                    </span>
                    {h.upsell_signals?.length>0&&<span style={{fontSize:9,color:"#10b981"}}>💡 Upsell ready</span>}
                    {h.days_to_renewal!=null&&<span style={{fontSize:9,color:"var(--text-muted)"}}>Renews {h.days_to_renewal}d</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
