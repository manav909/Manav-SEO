import React,{useState,useEffect} from "react";
import PortalNav from "@/components/PortalNav";
import {useNavigate} from "react-router-dom";

const post = (a: string, b: any = {}) =>
  fetch("/api/task-engine", {method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({action:a,...b})})
  .then(r => r.json()).catch(() => ({}));

const ROLE_COLORS: any = {
  hod:"#6366f1", bde:"#10b981", pm:"#06b6d4",
  content_writer:"#f59e0b", sales_manager:"#a78bfa", bdm:"#f97316",
};
const ROLES = ["bde","bdm","pm","content_writer","sales_manager","hod"];

// All available panels with labels
const PANELS = [
  { key:"bde_panel",        label:"BDE Panel",          desc:"Fiverr analyser, lead intel, live agent, documents" },
  { key:"lead_intel",       label:"Lead Intel",         desc:"Saved leads, suggestions, history" },
  { key:"live_agent",       label:"Live Agent",         desc:"Real-time conversation coaching" },
  { key:"documents",        label:"Documents",          desc:"Generate client proposals and emails" },
  { key:"audit_tools",      label:"Audit Tools",        desc:"SEO site audit tool" },
  { key:"playground",       label:"Canvas / Playground",desc:"Strategy canvas and pipeline" },
  { key:"dashboard",        label:"Dashboard",          desc:"Overview and metrics" },
  { key:"algorithm_intel",  label:"Algorithm Intel",    desc:"Google algorithm tracking" },
  { key:"brain_learning",   label:"Brain Learning",     desc:"View and manage learnings" },
  { key:"data_room",        label:"Data Room",          desc:"Client documents and reports" },
  { key:"system_control",   label:"System Control",     desc:"System settings and monitoring" },
  { key:"morning_brief",    label:"Morning Brief",      desc:"Daily AI intelligence brief" },
  { key:"staff_command",    label:"Staff Command",      desc:"Manage team (HOD only)" },
];

// Default permissions by role
const ROLE_DEFAULTS: any = {
  bde:            { bde_panel:true, lead_intel:true, live_agent:true, documents:true, audit_tools:true },
  bdm:            { bde_panel:true, lead_intel:true, live_agent:true, documents:true, audit_tools:true, dashboard:true, morning_brief:true },
  pm:             { dashboard:true, playground:true, data_room:true, morning_brief:true },
  content_writer: { playground:true, algorithm_intel:true, brain_learning:true },
  sales_manager:  { bde_panel:true, lead_intel:true, live_agent:true, documents:true, dashboard:true, staff_command:true },
  hod:            Object.fromEntries(PANELS.map(p=>[p.key,true])),
};

export default function StaffCommand() {
  const [staff,     setStaff]     = useState<any[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState("");
  const [form,      setForm]      = useState({ name:"", email:"", role:"bde", timezone:"Europe/London" });
  const [openPerms, setOpenPerms] = useState<string|null>(null); // staff id with open perm panel
  const [savingPerms, setSavingPerms] = useState<string|null>(null);
  const navigate = useNavigate();

  const load = () => {
    setLoading(true);
    post("get_staff").then(r => { setStaff((r as any).staff || []); setLoading(false); });
  };
  useEffect(() => { load(); }, []);

  const handleAdd = async () => {
    if (!form.name.trim()) { setError("Name is required"); return; }
    setSaving(true); setError("");
    const defaultPerms = ROLE_DEFAULTS[form.role] || {};
    const r = await post("create_staff", {
      name: form.name.trim(),
      email: form.email.trim() || undefined,
      role: form.role,
      timezone: form.timezone,
      permissions: defaultPerms,
    });
    setSaving(false);
    if ((r as any).success) {
      setShowModal(false);
      setForm({ name:"", email:"", role:"bde", timezone:"Europe/London" });
      load();
    } else {
      setError((r as any).error || "Failed to create staff");
    }
  };

  const togglePerm = async (s: any, key: string) => {
    const current = s.permissions || {};
    const updated  = { ...current, [key]: !current[key] };
    setSavingPerms(s.id);
    await post("update_staff_permissions", { staffId: s.id, permissions: updated });
    setStaff(prev => prev.map(m => m.id === s.id ? { ...m, permissions: updated } : m));
    setSavingPerms(null);
  };

  const applyRoleDefaults = async (s: any) => {
    const defaults = ROLE_DEFAULTS[s.role] || {};
    setSavingPerms(s.id);
    await post("update_staff_permissions", { staffId: s.id, permissions: defaults });
    setStaff(prev => prev.map(m => m.id === s.id ? { ...m, permissions: defaults } : m));
    setSavingPerms(null);
  };

  const inp = "w-full px-3 py-2 rounded-lg border border-border bg-background text-sm outline-none focus:border-primary";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <PortalNav />
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Staff Command</h1>
            <p className="text-sm text-muted-foreground mt-1">Manage team members and their panel access</p>
          </div>
          <button onClick={() => { setShowModal(true); setError(""); }}
            className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90">
            + Add Staff
          </button>
        </div>

        {/* Add Staff Modal */}
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
            <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-md shadow-2xl">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-base font-bold">Add New Staff Member</h2>
                <button onClick={() => setShowModal(false)} className="text-muted-foreground hover:text-foreground text-lg">✕</button>
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
                    {ROLES.map(r => <option key={r} value={r}>{r.replace(/_/g," ").replace(/_./g,c=>c[1].toUpperCase()).replace(/^./,c=>c.toUpperCase())}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Timezone</label>
                  <select className={inp} value={form.timezone} onChange={e => setForm(f=>({...f, timezone:e.target.value}))}>
                    {["Europe/London","Asia/Kolkata","America/New_York","America/Los_Angeles","Asia/Dubai","Australia/Sydney"]
                      .map(tz => <option key={tz} value={tz}>{tz.replace(/_/g," ")}</option>)}
                  </select>
                </div>
                <p className="text-xs text-muted-foreground">Default panel access for <strong>{form.role.replace(/_/g," ")}</strong> will be applied automatically. You can customise after adding.</p>
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
            <p className="text-sm text-muted-foreground mb-4">No staff yet.</p>
            <button onClick={() => setShowModal(true)}
              className="px-6 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium">
              + Add First Staff Member
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {staff.map((s: any) => {
              const color   = ROLE_COLORS[s.role] || "#6366f1";
              const perms   = s.permissions || {};
              const enabled = PANELS.filter(p => perms[p.key]).length;
              const isOpen  = openPerms === s.id;
              return (
                <div key={s.id} className="border border-border rounded-2xl bg-card overflow-hidden">
                  {/* Staff row */}
                  <div className="flex items-center gap-4 p-4">
                    <div className="h-10 w-10 rounded-xl flex items-center justify-center text-sm font-bold flex-shrink-0"
                      style={{background:`${color}15`, color, border:`1px solid ${color}30`}}>
                      {s.avatar_initials || s.name?.slice(0,2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold">{s.name}</div>
                      <div className="text-xs capitalize" style={{color}}>{s.role?.replace(/_/g," ")}</div>
                      {s.email && <div className="text-xs text-muted-foreground truncate">{s.email}</div>}
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className="text-xs text-muted-foreground">{enabled}/{PANELS.length} panels</span>
                      <button
                        onClick={() => setOpenPerms(isOpen ? null : s.id)}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium border border-border hover:border-primary/40 transition-colors">
                        {isOpen ? "✕ Close" : "🔑 Permissions"}
                      </button>
                      <button onClick={() => navigate(`/profile/${s.id}`)}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium border border-border hover:border-primary/40 transition-colors">
                        View Profile
                      </button>
                    </div>
                  </div>

                  {/* Permissions panel */}
                  {isOpen && (
                    <div className="border-t border-border p-4 bg-muted/20">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <span className="text-sm font-semibold">Panel Access</span>
                          <span className="text-xs text-muted-foreground ml-2">{enabled} of {PANELS.length} enabled</span>
                        </div>
                        <button
                          onClick={() => applyRoleDefaults(s)}
                          disabled={savingPerms === s.id}
                          className="text-xs px-3 py-1.5 rounded-lg border border-border hover:border-primary/40">
                          ↺ Reset to {s.role?.replace(/_/g," ")} defaults
                        </button>
                      </div>
                      <div className="grid gap-2" style={{gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))"}}>
                        {PANELS.map(panel => {
                          const on = !!perms[panel.key];
                          return (
                            <button key={panel.key}
                              onClick={() => togglePerm(s, panel.key)}
                              disabled={savingPerms === s.id}
                              className="flex items-start gap-3 p-3 rounded-xl border text-left transition-all"
                              style={{
                                borderColor: on ? `${color}40` : "var(--border)",
                                background:  on ? `${color}08` : "transparent",
                                opacity: savingPerms === s.id ? 0.6 : 1,
                              }}>
                              <div className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0 mt-0.5"
                                style={{background: on ? color : "transparent", border:`1.5px solid ${on?color:"#555"}`}}>
                                {on && <span className="text-white text-xs font-bold">✓</span>}
                              </div>
                              <div>
                                <div className="text-xs font-semibold">{panel.label}</div>
                                <div className="text-xs text-muted-foreground mt-0.5">{panel.desc}</div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
