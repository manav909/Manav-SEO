import React,{useState,useEffect} from "react";
import {useParams,useNavigate} from "react-router-dom";
import PortalNav from "@/components/PortalNav";
const post=(a:string,b:any={})=>fetch("/api/task-engine",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:a,...b})}).then(r=>r.json()).catch(()=>({}));
const COLORS:any={hod:"#6366f1",bde:"#10b981",pm:"#06b6d4",content_writer:"#f59e0b"};
export default function StaffProfile(){
  const{id}=useParams<{id:string}>();
  const navigate=useNavigate();
  const[staff,setStaff]=useState<any>(null);
  const[loading,setLoading]=useState(true);
  useEffect(()=>{if(id)post("get_staff_member",{staffId:id}).then(r=>{setStaff((r as any).staff||r);setLoading(false);});},[id]);
  if(loading)return(<div className="min-h-screen bg-background flex items-center justify-center"><div className="text-sm text-muted-foreground">Loading...</div></div>);
  if(!staff?.name)return(<div className="min-h-screen bg-background flex items-center justify-center"><div className="text-center"><div className="text-sm text-muted-foreground mb-3">Not found.</div><button onClick={()=>navigate("/staff-command")} className="text-sm text-primary">Back</button></div></div>);
  const c=COLORS[staff.role]||"#6366f1";
  return(<div className="min-h-screen bg-background text-foreground"><PortalNav/><div className="max-w-3xl mx-auto px-6 py-8"><button onClick={()=>navigate("/staff-command")} className="text-sm text-muted-foreground hover:text-foreground mb-6">Back</button><div className="rounded-2xl border border-border bg-card p-6 mb-4"><div className="flex items-center gap-4 mb-6"><div className="h-16 w-16 rounded-2xl flex items-center justify-center text-xl font-bold" style={{background:`${c}15`,color:c,border:`1px solid ${c}30`}}>{staff.avatar_initials||staff.name?.slice(0,2).toUpperCase()}</div><div><h1 className="text-xl font-bold">{staff.name}</h1><div className="text-sm mt-0.5 capitalize" style={{color:c}}>{staff.role?.replace("_"," ")}</div><div className="text-xs text-muted-foreground mt-0.5">{staff.email}</div></div></div><div className="grid grid-cols-2 gap-3"><div className="rounded-xl bg-secondary/50 p-3"><div className="text-xs text-muted-foreground mb-1">Performance</div><div className="text-xl font-bold font-mono" style={{color:c}}>{staff.performance_score||75}%</div></div><div className="rounded-xl bg-secondary/50 p-3"><div className="text-xs text-muted-foreground mb-1">Status</div><div className="text-sm font-medium">{staff.is_active?"Active":"Inactive"}</div></div></div></div>{staff.stats_cache&&<div className="rounded-2xl border border-border bg-card p-5"><div className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">Stats</div><div className="grid grid-cols-2 gap-3">{Object.entries(staff.stats_cache).map(([k,v]:any)=>(<div key={k} className="rounded-xl bg-secondary/50 p-3"><div className="text-xs text-muted-foreground mb-1 capitalize">{k.replace(/_/g," ")}</div><div className="text-lg font-bold font-mono text-primary">{String(v)}</div></div>))}</div></div>}</div></div>);
}
