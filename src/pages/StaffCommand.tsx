import React,{useState,useEffect} from "react";
import PortalNav from "@/components/PortalNav";
import {useNavigate} from "react-router-dom";

const post = (a: string, b: any = {}) =>
  fetch("/api/task-engine", {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({action:a,...b})})
    .then(r => r.json()).catch(() => ({}));

const ROLE_COLORS: any = {
  hod: "#6366f1", bde: "#10b981", pm: "#06b6d4", content_writer: "#f59e0b", sales_manager: "#a78bfa", bdm: "#f97316",
};
const ROLES = ["bde","bdm","pm","content_writer","sales_manager","hod"];

export default function StaffCommand() {
  const [staff,   setStaff]   = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ name:"", email:"", role:"bde", timezone:"Europe/London" });
  const navigate = useNavigate();

  const load = () => {
    setLoading(true);
    post("get_staff").then(r => { setStaff((r as any).staff || []); setLoading(false); });
  };

  useEffect(() => { load(); }, []);

  const handleAdd = async () => {
    if (!form.name.trim()) { setError("Name is required"); return; }
    setSaving(true); setError("");
    const r = await post("create_staff", { name: form.name.trim(), email: form.email.trim()||undefined, role: form.role, timezone: form.timezone });
    setSaving(false);
    if ((r as any).success) {
      setShowModal(false);
      setForm({ name:"", email:"", role:"bde", timezone:"Europe/London" });
      load();
    } else {
      setError((r as any).error || "Failed to create staff");
    }
  };

  const inp = "w-full px-3 py-2 rounded-lg border border-border bg-background text-sm outline-none focus:border-primary";

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
            onClick={() => { setShowModal(true); setError(""); }}
            className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90"
          >
            + Add Staff
          </button>
        </div>

        {/* Add Staff Modal */}
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
            <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-md shadow-2xl">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-base font-bold">Add New Staff Member</h2>
                <button onClick={() => setShowModal(false)} className="text-muted-foreground hover:text-foreground text-lg leading-none">✕</button>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Full Name *</label>
                  <input className={inp} placeholder="e.g. Aryan Sharma" value={form.name}
                    onChange={e => setForm(f=>({...f, name:e.target.value}))}
                    onKeyDown={e => e.key==="Enter" && handleAdd()} autoFocus />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Email (optional)</label>
                  <input className={inp} placeholder="aryan@seoseason.com" type="email" value={form.email}
                    onChange={e => setForm(f=>({...f, email:e.target.value}))} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Role</label>
                  <select className={inp} value={form.role} onChange={e => setForm(f=>({...f, role:e.target.value}))}>
                    {ROLES.map(r => <option key={r} value={r}>{r.replace(/_/g," ").replace(/\w/g,c=>c.toUpperCase())}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Timezone</label>
                  <select className={inp} value={form.timezone} onChange={e => setForm(f=>({...f, timezone:e.target.value}))}>
                    {["Europe/London","Asia/Kolkata","America/New_York","America/Los_Angeles","Asia/Dubai","Australia/Sydney"].map(tz =>
                      <option key={tz} value={tz}>{tz.replace("_"," ")}</option>)}
                  </select>
                </div>
                {error && <p className="text-xs text-red-400">{error}</p>}
                <div className="flex gap-2 pt-1">
                  <button onClick={() => setShowModal(false)}
                    className="flex-1 px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground">
                    Cancel
                  </button>
                  <button onClick={handleAdd} disabled={saving || !form.name.trim()}
                    className="flex-1 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50">
                    {saving ? "Adding..." : "Add Staff"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="text-center py-16 text-sm text-muted-foreground">Loading team...</div>
        ) : staff.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-4xl mb-4">👥</div>
            <p className="text-sm text-muted-foreground mb-4">No staff yet. Add your first team member.</p>
            <button onClick={() => setShowModal(true)}
              className="px-6 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90">
              + Add First Staff Member
            </button>
          </div>
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
                    <div className="h-10 w-10 rounded-xl flex items-center justify-center text-sm font-bold"
                      style={{background:`${color}15`, color, border:`1px solid ${color}30`}}>
                      {s.avatar_initials || s.name?.slice(0,2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold truncate">{s.name}</div>
                      <div className="text-xs capitalize" style={{color}}>{s.role?.replace(/_/g," ")}</div>
                    </div>
                  </div>
                  {s.email && <div className="text-xs text-muted-foreground truncate mb-2">{s.email}</div>}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{background:`${color}15`,color}}>
                      {s.role?.replace(/_/g," ")}
                    </span>
                    {s.timezone && <span className="text-xs text-muted-foreground">{s.timezone.split("/")[1]?.replace("_"," ")}</span>}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
