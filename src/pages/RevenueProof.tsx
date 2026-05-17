import PortalNav from '@/components/PortalNav';
import { useProject } from '@/contexts/ProjectContext';
import React,{useState,useEffect} from "react";
import AnimatedBg from "@/components/AnimatedBg";
import ThemeToggle from "@/components/ThemeToggle";
import MetricCard from "@/components/MetricCard";
const post=(a:string,b:any={})=>fetch("/api/task-engine",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:a,...b})}).then(r=>r.json()).catch(()=>({}));
export default function RevenueProof(){
  const { selectedProjectId: projectId } = useProject();
  const[overview,setOverview]=useState<any>({});
  const[health,setHealth]=useState<any[]>([]);
  useEffect(()=>{
    post("get_revenue_overview").then(r=>setOverview(r));
    post("get_health_dashboard").then(r=>setHealth((r as any).health||[]));
  },[]);
  return(
    <div className="empire-page" style={{minHeight:"100vh",background:"var(--bg)",color:"var(--text)",fontFamily:"-apple-system,'SF Pro Display',system-ui,sans-serif"}}>
      <PortalNav />
      
      <div style={{position:"relative",zIndex:1}}>
        
          </div>
                  </div>
        <div style={{maxWidth:900,margin:"0 auto",padding:"24px 24px 100px"}}>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:12,marginBottom:24}}>
            <MetricCard value={overview.mrr||0} label="MRR" prefix="£" icon="📅" animate/>
            <MetricCard value={overview.arr||0} label="ARR" prefix="£" icon="📈" animate/>
            <MetricCard value={overview.totalPaid||0} label="Total Received" prefix="£" icon="✅" animate/>
            <MetricCard value={overview.pending||0} label="Pending" prefix="£" icon="⏳" animate/>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))",gap:12}}>
            {health.map((h:any)=>(
              <div key={h.project_id} className="glass-card" style={{padding:"16px"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                  <div style={{fontSize:13,fontWeight:700,color:"var(--text)"}}>{(h as any).projects?.name||"Project"}</div>
                  <div style={{fontSize:18,fontWeight:800,fontFamily:"monospace",
                    color:h.overall_score>=70?"#10b981":h.overall_score>=50?"var(--accent)":"#ef4444"}}>
                    {h.overall_score}
                  </div>
                </div>
                <div className="empire-progress-track">
                  <div className="empire-progress-fill" style={{width:`${h.overall_score}%`}}/>
                </div>
                <div style={{fontSize:10,color:"var(--text-muted)",marginTop:8}}>{h.recommended_action}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
