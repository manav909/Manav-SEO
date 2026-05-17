import AnimatedBg from "@/components/AnimatedBg";
import ThemeToggle from "@/components/ThemeToggle";
import React,{useState,useEffect} from "react";
const post=(a:string,b:any={})=>fetch("/api/task-engine",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:a,...b})}).then(r=>r.json()).catch(()=>({}));
export default function Reports(){
  const[projects,setProjects]=useState<any[]>([]);const[sel,setSel]=useState("");const[reports,setReports]=useState<any[]>([]);const[gen,setGen]=useState<string|null>(null);const[preview,setPreview]=useState<string|null>(null);
  useEffect(()=>{import("@/lib/supabase").then(({supabase})=>{supabase.from("projects").select("id,name").limit(20).then(({data})=>{setProjects(data||[]);if(data?.length)setSel(data[0].id);});});},[]);
  useEffect(()=>{if(sel)post("get_reports",{projectId:sel,limit:10}).then(r=>setReports((r as any).reports||[]));},[sel]);
  const generate=async(type:string)=>{setGen(type);const r=await post("generate_report",{projectId:sel,reportType:type});if((r as any).report?.html_content)setPreview((r as any).report.html_content);post("get_reports",{projectId:sel,limit:10}).then(r=>setReports((r as any).reports||[]));setGen(null);};
  const S:any={p:{minHeight:"100vh",background:"var(--bg)",color:"var(--text)",padding:28,fontFamily:"var(--font-display,-apple-system,system-ui,sans-serif)"},c:{background:"var(--bg-card)",border:"0.5px solid #1e1e3a",borderRadius:12,padding:18,marginBottom:10},sel:{background:"var(--bg-card)",border:"0.5px solid #1e1e3a",borderRadius:8,color:"var(--text)",padding:"8px 14px",fontSize:13}};
  return(<div style={S.p}>
      <AnimatedBg/>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
      <div><div style={{fontSize:22,fontWeight:700}}>📊 Reports</div><div style={{fontSize:13,color:"var(--text-sub)",marginTop:4}}>Auto-generated client-ready reports</div></div>
      <select style={S.sel} value={sel} onChange={e=>setSel(e.target.value)}>{projects.map((p:any)=><option key={p.id} value={p.id}>{p.name}</option>)}</select>
    </div>
    <div style={{display:"flex",gap:10,marginBottom:20}}>
      {[["weekly","Weekly","#6366f1"],["monthly","Monthly","#8b5cf6"],["quarterly","Quarterly","#a78bfa"]].map(([type,label,color])=><button key={type} onClick={()=>generate(type)} disabled={!!gen} style={{background:`${color}20`,border:`0.5px solid ${color}50`,borderRadius:8,color,padding:"9px 18px",fontSize:13,fontWeight:600,cursor:"pointer"}}>{gen===type?`Generating...`:`+ ${label} Report`}</button>)}
    </div>
    {preview&&<div style={{...S.c,marginBottom:20}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:12}}><div style={{fontSize:14,fontWeight:600}}>Preview</div><button style={{background:"transparent",border:"none",color:"var(--text-muted)",cursor:"pointer",fontSize:16}} onClick={()=>setPreview(null)}>✕</button></div><div style={{background:"var(--bg)",borderRadius:8,padding:16,maxHeight:400,overflowY:"auto"}} dangerouslySetInnerHTML={{__html:preview}}/></div>}
    {reports.map((r:any)=><div key={r.id} style={{...S.c,display:"flex",justifyContent:"space-between",alignItems:"center"}}><div><div style={{fontSize:14,fontWeight:600,marginBottom:3}}>{r.title}</div><div style={{fontSize:12,color:"var(--text-sub)"}}>{new Date(r.created_at).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"})}</div></div><div style={{display:"flex",gap:8,alignItems:"center"}}><span style={{fontSize:10,padding:"3px 10px",borderRadius:20,background:"rgba(99,102,241,.1)",color:"#818cf8",border:"0.5px solid rgba(99,102,241,.2)"}}>{r.report_type}</span><a href={`/reports/${r.token}`} target="_blank" style={{background:"rgba(255,255,255,.05)",border:"0.5px solid #1e1e3a",borderRadius:6,color:"var(--text-sub)",padding:"5px 12px",fontSize:11,textDecoration:"none"}}>View ↗</a></div></div>)}
    {!reports.length&&<div style={{color:"var(--text-muted)",textAlign:"center",padding:40,fontSize:14}}>No reports yet. Generate your first above.</div>}
  </div>);
}