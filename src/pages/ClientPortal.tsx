import React,{useState,useEffect} from "react";
import PortalNav from "@/components/PortalNav";
import { useProject } from "@/contexts/ProjectContext";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";

export default function ClientPortal(){
  const[projects,setProjects]=useState<any[]>([]);
  const[loading,setLoading]=useState(true);
  const{setSelectedProjectId}=useProject();
  const navigate=useNavigate();

  useEffect(()=>{
    supabase.from("projects").select("*").limit(20).then(({data})=>{
      setProjects(data||[]); setLoading(false);
    });
  },[]);

  const openProject=(p:any)=>{ setSelectedProjectId(p.id); navigate("/client-dashboard"); };

  return(
    <div className="min-h-screen bg-background text-foreground">
      <PortalNav/>
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight">Client Portal</h1>
          <p className="text-sm text-muted-foreground mt-1">All active projects — click to open campaign view</p>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">
            Loading projects...
          </div>
        ) : (
          <div className="grid gap-4" style={{gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))"}}>
            {projects.map((p:any)=>(
              <button key={p.id} onClick={()=>openProject(p)}
                className="text-left p-5 rounded-2xl border border-border bg-card hover:border-primary/40 hover:bg-primary/5 transition-all duration-200 group">
                <div className="flex justify-between items-start mb-4">
                  <div className="h-10 w-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-sm font-bold text-primary">
                    {(p.name||"P").slice(0,2).toUpperCase()}
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">
                    ACTIVE
                  </span>
                </div>
                <div className="font-semibold text-sm mb-1">{p.name}</div>
                <div className="text-xs text-muted-foreground mb-2 truncate">{p.url}</div>
                <div className="text-xs text-muted-foreground/60 line-clamp-2">
                  {(p.goals||"Improving organic search visibility").slice(0,80)}
                </div>
                <div className="mt-4 text-xs font-medium text-primary group-hover:translate-x-0.5 transition-transform">
                  View Campaign →
                </div>
              </button>
            ))}
            {!projects.length && (
              <div className="col-span-full text-center py-16 text-sm text-muted-foreground">
                No projects yet.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
