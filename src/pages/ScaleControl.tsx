import React,{useState,useEffect} from "react";
import {supabase} from "@/lib/supabase";

interface Tenant {
  id: string;
  name: string;
  slug: string;
  plan: 'agency' | 'enterprise' | 'partner';
  config: Record<string, any>;
  api_quota: number;
  created_at: string;
}
export default function ScaleControl(){
  const [tenants,setTenants]=useState<Tenant[]>([]);
  const [loading,setLoading]=useState(true);
  const [form,setForm]=useState({name:"",slug:"",plan:"agency"});
  const [adding,setAdding]=useState(false);
  useEffect(()=>{load();},[]);
  async function load(){const{data}=await supabase.from("tenants").select("*").order("created_at",{ascending:false});setTenants(data||[]);setLoading(false);}
  async function addTenant(){
    if(!form.name||!form.slug)return;
    setAdding(true);
    await supabase.from("tenants").insert({name:form.name,slug:form.slug,plan:form.plan});
    setForm({name:"",slug:"",plan:"agency"});await load();setAdding(false);
  }
  const S:any={page:{minHeight:"100vh",background:"#070710",color:"#f0f0ff",padding:24,fontFamily:"system-ui"},
    card:{background:"#0d0d1a",border:"0.5px solid #1e1e3a",borderRadius:12,padding:20,marginBottom:10},
    inp:{background:"#0d0d1a",border:"0.5px solid #1e1e3a",borderRadius:8,color:"#f0f0ff",padding:"8px 12px",fontSize:13,width:"100%"},
    btn:{background:"#6366f1",border:"none",borderRadius:8,color:"#fff",padding:"10px 20px",fontSize:13,fontWeight:600,cursor:"pointer"}};
  if(loading)return<div style={{...S.page,display:"flex",alignItems:"center",justifyContent:"center"}}><span style={{color:"#4b4b6a"}}>Loading…</span></div>;
  return(
    <div style={S.page}>
      <div style={{fontSize:22,fontWeight:700,marginBottom:6}}>🏰 Scale Control</div>
      <div style={{fontSize:14,color:"#8b8ba8",marginBottom:24}}>Multi-tenant management. One empire, many kingdoms.</div>
      <div style={S.card}>
        <div style={{fontSize:15,fontWeight:600,marginBottom:12}}>Add Tenant</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr auto",gap:10,alignItems:"end"}}>
          <div><div style={{fontSize:11,color:"#4b4b6a",marginBottom:4}}>NAME</div><input style={S.inp} value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="Agency name"/></div>
          <div><div style={{fontSize:11,color:"#4b4b6a",marginBottom:4}}>SLUG</div><input style={S.inp} value={form.slug} onChange={e=>setForm({...form,slug:e.target.value.toLowerCase().replace(/\s+/g,'-')})} placeholder="agency-slug"/></div>
          <button style={S.btn} onClick={addTenant} disabled={adding}>{adding?"Adding…":"Add"}</button>
        </div>
      </div>
      {tenants.map((t:any)=>(
        <div key={t.id} style={S.card}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div><div style={{fontSize:14,fontWeight:600}}>{t.name}</div><div style={{fontSize:12,color:"#4b4b6a",fontFamily:"monospace"}}>/{t.slug}</div></div>
            <span style={{fontSize:11,padding:"3px 10px",borderRadius:20,background:"rgba(99,102,241,.15)",color:"#818cf8",border:"0.5px solid rgba(99,102,241,.3)"}}>{t.plan}</span>
          </div>
        </div>
      ))}
    </div>
  );
}