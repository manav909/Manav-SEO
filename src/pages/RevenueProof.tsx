import React,{useState,useEffect} from "react";
import PortalNav from "@/components/PortalNav";
import {useProject} from "@/contexts/ProjectContext";
const post=(a:string,b:any={})=>fetch("/api/task-engine",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:a,...b})}).then(r=>r.json()).catch(()=>({}));
export default function RevenueProof(){
  const{selectedProjectId:projectId}=useProject();
  const[overview,setOverview]=useState<any>({});
  const[health,setHealth]=useState<any[]>([]);
  useEffect(()=>{ post("get_revenue_overview",{projectId}).then(r=>setOverview(r)); post("get_health_dashboard",{projectId}).then(r=>setHealth((r as any).health||[])); },[projectId]);
  return(<div className="min-h-screen bg-background text-foreground"><PortalNav/><div className="max-w-5xl mx-auto px-6 py-8"><div className="mb-6"><h1 className="text-2xl font-bold">Revenue Proof</h1></div><div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">{[{v:overview.mrr||0,l:"MRR",c:"#10b981"},{v:overview.arr||0,l:"ARR",c:"#6366f1"},{v:overview.totalPaid||0,l:"Received",c:"#06b6d4"},{v:overview.pending||0,l:"Pending",c:"#f59e0b"}].map(s=>(<div key={s.l} className="rounded-2xl border border-border bg-card p-4"><div className="text-xs text-muted-foreground mb-1">{s.l}</div><div className="text-2xl font-bold font-mono" style={{color:s.c}}>£{s.v.toLocaleString()}</div></div>))}</div><div className="grid gap-3" style={{gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))"}}>{health.map((h:any)=>(<div key={h.project_id} className="rounded-2xl border border-border bg-card p-4"><div className="flex justify-between items-center mb-2"><div className="text-sm font-semibold">{(h as any).projects?.name||"Project"}</div><div className="text-lg font-bold font-mono text-primary">{h.overall_score}</div></div><div className="h-1.5 rounded-full bg-border overflow-hidden"><div className="h-full rounded-full bg-primary" style={{width:`${h.overall_score}%`}}></div></div></div>))}{!health.length&&<div className="col-span-full text-center py-12 text-sm text-muted-foreground">No data yet.</div>}</div></div></div>);
}
