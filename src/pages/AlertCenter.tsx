import React,{useState,useEffect} from "react";
const post=(a:string,b:any={})=>fetch("/api/task-engine",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:a,...b})}).then(r=>r.json()).catch(()=>({}));
const sc:any={urgent:"#ef4444",critical:"#f97316",warning:"#f59e0b",info:"#06b6d4"};
export default function AlertCenter(){
  const[alerts,setAlerts]=useState<any[]>([]);const[loading,setLoading]=useState(true);const[filter,setFilter]=useState("all");
  const load=async()=>{setLoading(true);const r=await post("get_alerts",{unreadOnly:false,limit:50});setAlerts((r as any).alerts||[]);setLoading(false);};
  useEffect(()=>{load();},[]);
  const markRead=async(id:string)=>{await post("mark_alert_read",{alertId:id});setAlerts(a=>a.map((x:any)=>x.id===id?{...x,read_at:new Date().toISOString()}:x));};
  const dismissAll=async()=>{await post("dismiss_all_alerts");load();};
  const filtered=filter==="all"?alerts:filter==="unread"?alerts.filter((a:any)=>!a.read_at):alerts.filter((a:any)=>a.severity===filter);
  const unread=alerts.filter((a:any)=>!a.read_at).length;
  const S:any={p:{minHeight:"100vh",background:"#070710",color:"#f0f0ff",padding:28,fontFamily:"-apple-system,system-ui,sans-serif"},fb:{background:"rgba(255,255,255,.05)",border:"0.5px solid #1e1e3a",borderRadius:8,color:"#8b8ba8",padding:"7px 12px",fontSize:11,cursor:"pointer",marginRight:6},act:{background:"rgba(99,102,241,.15)",border:"0.5px solid rgba(99,102,241,.3)",color:"#a78bfa"}};
  if(loading)return<div style={{...S.p,display:"flex",alignItems:"center",justifyContent:"center",color:"#4b4b6a"}}>Loading alerts...</div>;
  return(<div style={S.p}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
      <div><div style={{fontSize:22,fontWeight:700}}>🚨 Alert Center</div><div style={{fontSize:13,color:"#8b8ba8",marginTop:4}}>{unread} unread</div></div>
      <button style={{...S.fb,color:"#f87171",border:"0.5px solid rgba(239,68,68,.2)"}} onClick={dismissAll}>Dismiss All</button>
    </div>
    <div style={{marginBottom:16}}>{["all","unread","urgent","critical","warning","info"].map(f=><button key={f} style={{...S.fb,...(filter===f?S.act:{})}} onClick={()=>setFilter(f)}>{f.charAt(0).toUpperCase()+f.slice(1)}{f==="unread"&&unread>0?` (${unread})`:""}</button>)}</div>
    {filtered.map((a:any)=><div key={a.id} onClick={()=>!a.read_at&&markRead(a.id)} style={{background:a.read_at?"rgba(255,255,255,.02)":"rgba(255,255,255,.04)",border:`0.5px solid ${sc[a.severity]||"#1e1e3a"}35`,borderRadius:12,padding:"14px 18px",marginBottom:8,cursor:!a.read_at?"pointer":"default",opacity:a.read_at?0.6:1}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}><div style={{display:"flex",gap:8,alignItems:"center"}}><span style={{fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:20,background:`${sc[a.severity]||"#4b4b6a"}20`,color:sc[a.severity]||"#8b8ba8"}}>{a.severity?.toUpperCase()}</span><span style={{fontSize:10,color:"#4b4b6a"}}>{a.alert_type?.replace(/_/g," ")}</span></div><span style={{fontSize:11,color:"#4b4b6a"}}>{new Date(a.created_at).toLocaleString("en-GB",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"})}</span></div>
      <div style={{fontSize:14,fontWeight:600,marginBottom:4}}>{a.title}</div>
      <div style={{fontSize:13,color:"#8b8ba8",lineHeight:1.4}}>{a.body}</div>
    </div>)}
    {!filtered.length&&<div style={{color:"#4b4b6a",textAlign:"center",padding:40,fontSize:14}}>No alerts. Empire is calm.</div>}
  </div>);
}
