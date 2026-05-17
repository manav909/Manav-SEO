import AnimatedBg from "@/components/AnimatedBg";
import ThemeToggle from "@/components/ThemeToggle";
import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { AreaChart, Area, RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer, XAxis, YAxis, Tooltip } from "recharts";
import { Brain, TrendingUp, RefreshCw, Shield } from "lucide-react";

interface Stats { avgBrainScore: number; learningsThisWeek: number; loopClosureRate: number; pendingVerifications: number; }
interface VelocityPoint { date: string; count: number; }
interface ProjectHealth { id: string; name: string; brainScore: number; learnings: number; lastWin: string; }
interface RadarPoint { topic: string; score: number; }

export default function BrainCommand() {
  const [stats, setStats]       = useState<Stats>({ avgBrainScore: 0, learningsThisWeek: 0, loopClosureRate: 0, pendingVerifications: 0 });
  const [velocity, setVelocity] = useState<VelocityPoint[]>([]);
  const [projects, setProjects] = useState<ProjectHealth[]>([]);
  const [radar, setRadar]       = useState<RadarPoint[]>([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const weekAgo  = new Date(Date.now() - 7 * 864e5).toISOString();
      const monthAgo = new Date(Date.now() - 30 * 864e5).toISOString();

      const [learnR, projR, algoR, verifyR, taskR] = await Promise.allSettled([
        supabase.from("brain_learnings").select("id,confidence_score,created_at,project_id").gte("created_at", monthAgo),
        supabase.from("projects").select("id,name,url").eq("status","active").limit(20),
        supabase.from("algorithm_knowledge").select("topic,freshness_score").order("freshness_score",{ascending:false}).limit(8),
        supabase.from("verification_queue").select("id,status"),
        supabase.from("task_executions").select("id,status").eq("status","done").gte("created_at", weekAgo),
      ]);

      const learnings = learnR.status==="fulfilled" ? learnR.value.data || [] : [];
      const projs     = projR.status==="fulfilled"  ? projR.value.data  || [] : [];
      const algos     = algoR.status==="fulfilled"  ? algoR.value.data  || [] : [];
      const verifs    = verifyR.status==="fulfilled" ? verifyR.value.data || [] : [];
      const tasks     = taskR.status==="fulfilled"  ? taskR.value.data  || [] : [];

      const weekLearnings = learnings.filter((l:any) => l.created_at >= weekAgo);
      const doneVerifs    = verifs.filter((v:any) => v.status==="done").length;
      const pendingVerifs = verifs.filter((v:any) => v.status==="pending").length;
      const loopRate      = tasks.length > 0 ? Math.round(doneVerifs / Math.max(tasks.length,1) * 100) : 0;

      setStats({
        avgBrainScore:       Math.round(learnings.reduce((s:number,l:any)=>s+(l.confidence_score||65),0)/Math.max(learnings.length,1)),
        learningsThisWeek:   weekLearnings.length,
        loopClosureRate:     loopRate,
        pendingVerifications: pendingVerifs,
      });

      // Velocity: group by date
      const byDate: Record<string,number> = {};
      const daysArr = Array.from({length:30},(_,i)=>{
        const d = new Date(Date.now() - (29-i)*864e5);
        return d.toISOString().split("T")[0];
      });
      daysArr.forEach(d => byDate[d]=0);
      learnings.forEach((l:any)=>{ const d=(l.created_at||"").split("T")[0]; if(byDate[d]!==undefined) byDate[d]++; });
      setVelocity(daysArr.map(d=>({ date:d.slice(5), count:byDate[d] })));

      // Project health
      const ph: ProjectHealth[] = [];
      for (const p of projs.slice(0,6)) {
        const pl = learnings.filter((l:any)=>l.project_id===p.id);
        const bs = pl.length>0 ? Math.min(100,Math.round(pl.reduce((s:number,l:any)=>s+(l.confidence_score||65),0)/pl.length)) : 0;
        ph.push({ id:p.id, name:p.name, brainScore:bs, learnings:pl.length, lastWin:"" });
      }
      setProjects(ph);

      // Radar
      setRadar((algos||[]).map((a:any)=>({ topic:(a.topic||"").slice(0,16), score:a.freshness_score||0 })));

    } catch(e) { console.error("BrainCommand load error",e); }
    setLoading(false);
  }

  const S = {
    page:   { minHeight:"100vh", background:"var(--bg)", color:"var(--text)", padding:"24px", fontFamily:"system-ui,sans-serif" } as React.CSSProperties,
    header: { display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:24 } as React.CSSProperties,
    title:  { fontSize:22, fontWeight:700, color:"var(--text)", display:"flex", alignItems:"center", gap:10 } as React.CSSProperties,
    grid4:  { display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))", gap:12, marginBottom:24 } as React.CSSProperties,
    tile:   { background:"var(--bg-card)", border:"0.5px solid #1e1e3a", borderRadius:12, padding:"16px 20px" } as React.CSSProperties,
    tileN:  { fontSize:32, fontWeight:700, fontFamily:"monospace", lineHeight:1, marginBottom:4 } as React.CSSProperties,
    tileL:  { fontSize:11, color:"var(--text-muted)", textTransform:"uppercase" as const, letterSpacing:1 },
    card:   { background:"var(--bg-card)", border:"0.5px solid #1e1e3a", borderRadius:12, padding:20, marginBottom:16 } as React.CSSProperties,
    cardT:  { fontSize:15, fontWeight:600, marginBottom:4 } as React.CSSProperties,
    cardS:  { fontSize:12, color:"var(--text-muted)", marginBottom:16 } as React.CSSProperties,
    grid2:  { display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(240px,1fr))", gap:12 } as React.CSSProperties,
    proj:   { background:"var(--bg-card)", border:"0.5px solid #1e1e3a", borderRadius:10, padding:14 } as React.CSSProperties,
    refresh:{ background:"transparent", border:"0.5px solid #1e1e3a", borderRadius:8, color:"#6b6b80", cursor:"pointer", padding:"6px 12px", fontSize:12, display:"flex", alignItems:"center", gap:6 } as React.CSSProperties,
  };

  const scoreColor = (n:number) => n>=75?"#10b981":n>=50?"#3b82f6":n>=25?"#eab308":"#ef4444";

  return (
    <div style={S.page}
      <AnimatedBg/>>
      <div style={S.header}>
        <div style={S.title}>
          <Brain size={22} color="#6366f1"/>
          Brain Command
        </div>
        <button style={S.refresh} onClick={loadAll} disabled={loading}>
          <RefreshCw size={13} style={loading?{animation:"spin 1s linear infinite"}:undefined}/>
          {loading ? "Loading..." : "Refresh"}
        </button>
      </div>

      {/* Stat tiles */}
      <div style={S.grid4}>
        {[
          { label:"Avg Brain Score",       value:stats.avgBrainScore,       unit:"/100", color:scoreColor(stats.avgBrainScore) },
          { label:"Learnings This Week",   value:stats.learningsThisWeek,   unit:"",     color:"#6366f1" },
          { label:"Loop Closure Rate",     value:stats.loopClosureRate,     unit:"%",    color:scoreColor(stats.loopClosureRate) },
          { label:"Verifications Pending", value:stats.pendingVerifications, unit:"",    color:stats.pendingVerifications>5?"#f97316":"#10b981" },
        ].map(t => (
          <div key={t.label} style={S.tile}>
            <div style={{...S.tileN, color:t.color}}>{t.value}{t.unit}</div>
            <div style={S.tileL}>{t.label}</div>
          </div>
        ))}
      </div>

      {/* Learning Velocity */}
      <div style={S.card}>
        <div style={S.cardT}>Brain Learning Velocity</div>
        <div style={S.cardS}>Auto-captured learnings per day — last 30 days</div>
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={velocity} margin={{top:4,right:8,left:-20,bottom:0}}>
            <defs>
              <linearGradient id="lv" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <XAxis dataKey="date" tick={{fontSize:10,fill:"var(--text-muted)"}} tickLine={false} axisLine={false} interval={6}/>
            <YAxis tick={{fontSize:10,fill:"var(--text-muted)"}} tickLine={false} axisLine={false}/>
            <Tooltip contentStyle={{background:"var(--bg-card)",border:"0.5px solid #1e1e3a",borderRadius:8,fontSize:12}} labelStyle={{color:"var(--text)"}} itemStyle={{color:"#818cf8"}}/>
            <Area type="monotone" dataKey="count" stroke="#6366f1" strokeWidth={2} fill="url(#lv)"/>
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Project health */}
      {projects.length > 0 && (
        <div style={S.card}>
          <div style={S.cardT}>Project Intelligence Health</div>
          <div style={S.cardS}>Brain score and learning count per active project</div>
          <div style={S.grid2}>
            {projects.map(p => (
              <div key={p.id} style={S.proj}>
                <div style={{fontSize:13,fontWeight:600,marginBottom:8,color:"var(--text)"}}>{p.name}</div>
                <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:6}}>
                  <div style={{fontSize:24,fontWeight:700,color:scoreColor(p.brainScore),fontFamily:"monospace"}}>{p.brainScore}</div>
                  <div>
                    <div style={{fontSize:10,color:"var(--text-muted)",textTransform:"uppercase",letterSpacing:.8}}>Brain Score</div>
                    <div style={{fontSize:11,color:"var(--text-sub)"}}>{p.learnings} learnings</div>
                  </div>
                </div>
                <div style={{background:"var(--border)",borderRadius:3,height:4,overflow:"hidden"}}>
                  <div style={{width:`${p.brainScore}%`,height:"100%",background:`linear-gradient(90deg,#6366f1,${scoreColor(p.brainScore)})`,borderRadius:3}}/>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Algorithm Radar */}
      {radar.length > 0 && (
        <div style={S.card}>
          <div style={S.cardT}><Shield size={15} style={{display:"inline",marginRight:6,color:"#ef4444"}}/>Algorithm Risk Radar</div>
          <div style={S.cardS}>Freshness score by topic — lower means higher risk</div>
          <ResponsiveContainer width="100%" height={280}>
            <RadarChart data={radar} margin={{top:10,right:30,bottom:10,left:30}}>
              <PolarGrid stroke="var(--border)"/>
              <PolarAngleAxis dataKey="topic" tick={{fontSize:10,fill:"var(--text-sub)"}}/>
              <Radar dataKey="score" stroke="#ef4444" fill="#ef4444" fillOpacity={0.15} strokeWidth={1.5}/>
              <Tooltip contentStyle={{background:"var(--bg-card)",border:"0.5px solid #1e1e3a",borderRadius:8,fontSize:12}}/>
            </RadarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
