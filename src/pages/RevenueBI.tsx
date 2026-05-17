import React,{useState,useEffect} from "react";
import PortalNav from "@/components/PortalNav";
import {useProject} from "@/contexts/ProjectContext";
const post=(a:string,b:any={})=>fetch("/api/task-engine",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:a,...b})}).then(r=>r.json()).catch(()=>({}));
export default function RevenueBI(){
  const{selectedProjectId:projectId}=useProject();
  const[overview,setOverview]=useState<any>({});
  const[records,setRecords]=useState<any[]>([]);
  const[loading,setLoading]=useState(true);
  useEffect(()=>{
    Promise.all([post("get_revenue_overview",{projectId}),post("get_revenue_records",{projectId,limit:12})])
      .then(([o,r])=>{setOverview(o);setRecords((r as any).records||[]);setLoading(false);});
  },[projectId]);
  const stats=[
    {v:overview.mrr||0,l:"MRR",pre:"£",c:"#10b981"},
    {v:overview.arr||0,l:"ARR",pre:"£",c:"#6366f1"},
    {v:overview.totalPaid||0,l:"Total",pre:"£",c:"#06b6d4"},
    {v:overview.activeClients||0,l:"Clients",pre:"",c:"#f59e0b"},
  ];
  return(
    <div className="min-h-screen bg-background text-foreground">
      <PortalNav/>
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="mb-6"><h1 className="text-2xl font-bold">Revenue BI</h1><p className="text-sm text-muted-foreground mt-1">MRR, ARR and pipeline intelligence</p></div>
        {loading?<div className="text-center py-16 text-sm text-muted-foreground">Loading...</div>:(
          <div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              {stats.map(s=>(
                <div key={s.l} className="rounded-2xl border border-border bg-card p-4">
                  <div className="text-xs text-muted-foreground mb-1">{s.l}</div>
                  <div className="text-2xl font-bold font-mono" style={{color:s.c}}>{s.pre}{s.v.toLocaleString()}</div>
                </div>
              ))}
            </div>
            <div className="rounded-2xl border border-border bg-card p-4">
              <div className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-4">Records</div>
              <div className="space-y-2">
                {records.map((r:any,i:number)=>(
                  <div key={r.id||i} className="flex justify-between py-2 border-b border-border/50 last:border-0">
                    <div><div className="text-sm font-medium">{r.record_type||"Retainer"}</div><div className="text-xs text-muted-foreground">{r.period_month}/{r.period_year}</div></div>
                    <div className="text-right"><div className="text-sm font-bold font-mono text-primary">£{(r.amount||0).toLocaleString()}</div><div className="text-xs text-muted-foreground">{r.status}</div></div>
                  </div>
                ))}
                {!records.length&&<div className="text-center py-8 text-sm text-muted-foreground">No records yet.</div>}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
