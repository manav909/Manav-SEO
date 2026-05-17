import AnimatedBg from "@/components/AnimatedBg";
import ThemeToggle from "@/components/ThemeToggle";
import React,{useState} from "react";
const post=(a:string,b:any={})=>fetch("/api/task-engine",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:a,...b})}).then(r=>r.json()).catch(()=>({}));
export default function Intake(){
  const[url,setUrl]=useState("");const[email,setEmail]=useState("");const[name,setName]=useState("");const[loading,setLoading]=useState(false);const[result,setResult]=useState<any>(null);const[step,setStep]=useState<"url"|"email"|"done">("url");
  const analyse=async()=>{if(!url)return;setLoading(true);const r=await post("capture_lead",{url,source:"intake"});setResult(r);setStep("email");setLoading(false);};
  const submit=async()=>{if(!email)return;setLoading(true);await post("capture_lead",{url,email,name,source:"intake"});setStep("done");setLoading(false);};
  const S:any={p:{minHeight:"100vh",background:"var(--bg)",color:"var(--text)",fontFamily:"var(--font-display,-apple-system)",display:"flex",flexDirection:"column" as const,alignItems:"center",justifyContent:"center",padding:24},c:{background:"var(--bg-card)",border:"0.5px solid #1e1e3a",borderRadius:16,padding:"36px 40px",width:"100%",maxWidth:520},h1:{fontSize:30,fontWeight:700,lineHeight:1.2,marginBottom:8,background:"linear-gradient(135deg,#a78bfa,#06b6d4)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"},inp:{width:"100%",background:"var(--bg)",border:"0.5px solid #1e1e3a",borderRadius:10,color:"var(--text)",padding:"13px 16px",fontSize:14,marginBottom:10,outline:"none",boxSizing:"border-box" as const},btn:{width:"100%",background:"linear-gradient(135deg,#6366f1,#a78bfa)",border:"none",borderRadius:10,color:"#fff",padding:14,fontSize:15,fontWeight:700,cursor:"pointer"}};
  return(<div style={S.p}
      <AnimatedBg/>><div style={S.c}>
    <div style={S.h1}>Is your website invisible to AI?</div>
    <div style={{fontSize:15,color:"var(--text-sub)",marginBottom:28,lineHeight:1.6}}>Free instant audit — see what's costing you rankings in 30 seconds.</div>
    {step==="url"&&<><input style={S.inp} value={url} onChange={e=>setUrl(e.target.value)} placeholder="yourdomain.com" onKeyDown={e=>e.key==="Enter"&&analyse()}/><button style={S.btn} onClick={analyse} disabled={loading||!url}>{loading?"Analysing...":"Get Free Instant Audit →"}</button></>}
    {step==="email"&&result&&<><div style={{background:"var(--bg-card)",border:"0.5px solid rgba(99,102,241,.3)",borderRadius:12,padding:20,marginBottom:20}}><div style={{fontSize:15,fontWeight:700,marginBottom:10}}>{result.instantAudit?.headline||`Analysis of ${url} complete`}</div>{(result.instantAudit?.missingBasics||[]).map((i:string,idx:number)=><div key={idx} style={{display:"flex",gap:8,padding:"6px 0",borderBottom:"0.5px solid #1e1e3a",fontSize:13,color:"#f87171"}}><span>⚠</span>{i}</div>)}</div><input style={S.inp} value={name} onChange={e=>setName(e.target.value)} placeholder="Your name (optional)"/><input style={S.inp} value={email} onChange={e=>setEmail(e.target.value)} placeholder="your@email.com"/><button style={S.btn} onClick={submit} disabled={loading||!email}>{loading?"Sending...":"Get Full Report →"}</button></>}
    {step==="done"&&<div style={{textAlign:"center",padding:"20px 0"}}><div style={{fontSize:40,marginBottom:16}}>🚀</div><div style={{fontSize:20,fontWeight:700,marginBottom:8}}>Report on its way.</div><div style={{fontSize:14,color:"var(--text-sub)"}}>Check your inbox. Full analysis of {url} underway.</div></div>}
  </div></div>);
}
