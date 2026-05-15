import React,{useState,useEffect} from "react";
import {supabase} from "@/lib/supabase";
import {AreaChart,Area,XAxis,YAxis,Tooltip,ResponsiveContainer} from "recharts";

interface RevMetric {
  id: string;
  project_id: string;
  recorded_at: string;
  organic_sessions: number;
  organic_value_usd: number;
  leads_generated: number;
  revenue_attributed: number;
}
interface Project { id: string; name: string; }
export default function RevenueProof(){
  const [projects,setProjects]=useState<Project[]>([]);
  const [sel,setSel]=useState<string|null>(null);
  const [rev,setRev]=useState<any[]>([]);
  const [brief,setBrief]=useState("");
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(true);
  useEffect(()=>{supabase.from("projects").select("id,name").limit(12).then(({data})=>{setProjects(data||[]);setLoading(false);});},[]);
  async function loadRev(id:string){
    setSel(id);setBrief("");
    const {data}=await supabase.from("revenue_metrics").select("*").eq("project_id",id).order("recorded_at",{ascending:false}).limit(12);
    setRev((data||[]).reverse());
  }
  async function genProof(){
    if(!sel)return;
    setBusy(true);setBrief("");
    const r=await fetch("/api/task-engine",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"client_brief",projectId:sel,briefType:"renewal"})});
    const d=await r.json();setBrief(d.brief||"Error");setBusy(false);
  }
  const S:any={page:{minHeight:"100vh",background:"#070710",color:"#f0f0ff",padding:24,fontFamily:"system-ui"},
    card:{background:"#0d0d1a",border:"0.5px solid #1e1e3a",borderRadius:12,padding:20,cursor:"pointer",marginBottom:10},
    btn:{background:"#10b981",border:"none",borderRadius:8,color:"#fff",padding:"10px 20px",fontSize:13,fontWeight:600,cursor:"pointer"},
    brief:{background:"#0d0d1a",border:"0.5px solid #1e1e3a",borderRadius:12,padding:20,whiteSpace:"pre-wrap",lineHeight:1.7,fontSize:14,marginTop:16}};
  if(loading)return<div style={{...S.page,display:"flex",alignItems:"center",justifyContent:"center"}}><span style={{color:"#4b4b6a"}}>Loading…</span></div>;
  return(
    <div style={S.page}>
      <div style={{fontSize:22,fontWeight:700,marginBottom:6}}>💰 Revenue &amp; Proof</div>
      <div style={{fontSize:14,color:"#8b8ba8",marginBottom:24}}>The business case — always ready.</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:10,marginBottom:24}}>
        {projects.map((p:any)=>(
          <div key={p.id} style={{...S.card,borderColor:sel===p.id?"#10b981":"#1e1e3a"}} onClick={()=>loadRev(p.id)}>
            <div style={{fontSize:14,fontWeight:600}}>{p.name}</div>
          </div>
        ))}
      </div>
      {sel&&rev.length>0&&(
        <div style={{background:"#0d0d1a",border:"0.5px solid #1e1e3a",borderRadius:12,padding:20,marginBottom:16}}>
          <div style={{fontSize:15,fontWeight:600,marginBottom:16}}>Organic Value Trend</div>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={rev}>
              <defs><linearGradient id="rv" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/><stop offset="95%" stopColor="#10b981" stopOpacity={0}/></linearGradient></defs>
              <XAxis dataKey="recorded_at" tickFormatter={(v:string)=>v.slice(5,10)} tick={{fontSize:10,fill:"#4b4b6a"}} tickLine={false} axisLine={false}/>
              <YAxis tick={{fontSize:10,fill:"#4b4b6a"}} tickLine={false} axisLine={false}/>
              <Tooltip contentStyle={{background:"#0d0d1a",border:"0.5px solid #1e1e3a",borderRadius:8,fontSize:12}}/>
              <Area type="monotone" dataKey="organic_value_usd" stroke="#10b981" strokeWidth={2} fill="url(#rv)" name="Value ($)"/>
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
      {sel&&<div><button style={S.btn} onClick={genProof} disabled={busy}>{busy?"Generating…":"📄 Generate Renewal Brief"}</button>{brief&&<div style={S.brief}>{brief}</div>}</div>}
    </div>
  );
}