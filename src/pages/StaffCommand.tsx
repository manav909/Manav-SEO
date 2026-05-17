import React,{useState,useEffect} from "react";
import PortalNav from "@/components/PortalNav";
import {useNavigate} from "react-router-dom";

const post = (a: string, b: any = {}) =>
  fetch("/api/task-engine", {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({action:a,...b})})
    .then(r => r.json()).catch(() => ({}));

const ROLE_COLORS: any = {
  hod: "#6366f1", bde: "#10b981", pm: "#06b6d4", content_writer: "#f59e0b",
};

export default function StaffCommand() {
  const [staff,   setStaff]   = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    post("get_staff").then(r => { setStaff((r as any).staff || []); setLoading(false); });
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <PortalNav />
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Staff Command</h1>
            <p className="text-sm text-muted-foreground mt-1">HOD control panel</p>
          </div>
          <button
            onClick={() => post("create_staff", {name:"New Staff", role:"bde"}).then(() => window.location.reload())}
            className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90"
          >
            + Add Staff
          </button>
        </div>
        {loading ? (
          <div className="text-center py-16 text-sm text-muted-foreground">Loading team...</div>
        ) : (
          <div className="grid gap-3" style={{gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))"}}>
            {staff.map((s: any) => {
              const color = ROLE_COLORS[s.role] || "#6366f1";
              return (
                <button
                  key={s.id}
                  onClick={() => navigate(`/profile/${s.id}`)}
                  className="text-left p-5 rounded-2xl border border-border bg-card hover:border-primary/40 transition-all duration-200"
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div
                      className="h-10 w-10 rounded-xl flex items-center justify-center text-sm font-bold"
                      style={{background:`${color}15`, color, border:`1px solid ${color}30`}}
                    >
                      {s.avatar_initials || s.name?.slice(0,2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold truncate">{s.name}</div>
                      <div className="text-xs capitalize" style={{color}}>{s.role?.replace("_"," ")}</div>
                    </div>
                    <div className="h-2 w-2 rounded-full bg-green-400 flex-shrink-0"></div>
                  </div>
                  <div className="h-1 rounded-full bg-border overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{width:`${s.performance_score||75}%`, background:color}}
                    ></div>
                  </div>
                  <div className="flex justify-between mt-2">
                    <span className="text-xs text-muted-foreground">Performance</span>
                    <span className="text-xs font-bold font-mono" style={{color}}>{s.performance_score||75}%</span>
                  </div>
                </button>
              );
            })}
            {!staff.length && (
              <div className="col-span-full text-center py-16 text-sm text-muted-foreground">
                No staff members yet.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
