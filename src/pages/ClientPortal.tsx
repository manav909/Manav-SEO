import PortalNav from '@/components/PortalNav';
import { useProject } from '@/contexts/ProjectContext';
import React,{useState,useEffect} from "react";
import AnimatedBg from "@/components/AnimatedBg";
import ThemeToggle from "@/components/ThemeToggle";

const post=(a:string,b:any={})=>fetch("/api/task-engine",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:a,...b})}).then(r=>r.json()).catch(()=>({}));

export default function ClientPortal(){
  const { selectedProjectId: projectId } = useProject();
  const[projects,setProjects]=useState<any[]>([]);
  const[loading,setLoading]=useState(true);
  useEffect(()=>{
    import("@/lib/supabase").then(({supabase})=>{
      supabase.from("projects").select("*").limit(20).then(({data})=>{setProjects(data||[]);setLoading(false);});
    });
  },[]);
  return(
    <div className="empire-page" style={{minHeight:"100vh",background:"var(--bg)",color:"var(--text)",fontFamily:"-apple-system,'SF Pro Display',system-ui,sans-serif"}}>
      <PortalNav />
      
      <div style={{position:"relative",zIndex:1}}>
        
              <div style={{fontSize:10,color:"var(--text-muted)",letterSpacing:"1px",textTransform:"uppercase" as const}}>All Active Projects</div>
            </div>
          </div>
                  </div>
        <div style={{maxWidth:1000,margin:"0 auto",padding:"24px 24px 100px"}}>
          {loading?<div style={{color:"var(--text-muted)",textAlign:"center" as const,padding:60}}>Loading projects...</div>:(
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:12}}>
              {projects.map((p:any,i:number)=>(
                <a key={p.id} href="/client-dashboard" className="glass-card"
                  style={{textDecoration:"none",padding:"20px",animation:`warp-in .4s ease ${i*0.06}s both`}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
                    <div style={{width:40,height:40,borderRadius:12,background:"var(--accent-glow)",
                      border:"0.5px solid var(--border-glow)",display:"flex",alignItems:"center",
                      justifyContent:"center",fontSize:16,fontWeight:700,color:"var(--accent-soft)"}}>
                      {(p.name||"P").slice(0,2).toUpperCase()}
                    </div>
                    <span style={{fontSize:9,fontWeight:700,padding:"2px 8px",borderRadius:20,
                      background:"rgba(16,185,129,.12)",color:"#10b981"}}>ACTIVE</span>
                  </div>
                  <div style={{fontSize:14,fontWeight:700,color:"var(--text)",marginBottom:4}}>{p.name}</div>
                  <div style={{fontSize:11,color:"var(--text-muted)",marginBottom:8}}>{p.url}</div>
                  <div style={{fontSize:11,color:"var(--text-sub)",lineHeight:1.5}}>{(p.goals||"Improving organic visibility").slice(0,80)}</div>
                  <div style={{marginTop:12,fontSize:11,color:"var(--accent-soft)",fontWeight:600}}>View Campaign →</div>
                </a>
              ))}
              {!projects.length&&<div style={{gridColumn:"1/-1",textAlign:"center" as const,padding:60,color:"var(--text-muted)"}}>No projects yet.</div>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
