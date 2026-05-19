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
const ROLE_DEFAULTS: any = {
  bde:            { bde_panel:true, lead_intel:true, live_agent:true, documents:true, audit_tools:true },
  bdm:            { bde_panel:true, lead_intel:true, live_agent:true, documents:true, audit_tools:true, dashboard:true, morning_brief:true },
  pm:             { dashboard:true, playground:true, data_room:true, morning_brief:true },
  content_writer: { playground:true, algorithm_intel:true, brain_learning:true },
  sales_manager:  { bde_panel:true, lead_intel:true, live_agent:true, documents:true, dashboard:true, staff_command:true },
  hod:            Object.fromEntries(PANELS.map(p=>[p.key,true])),
};

export default function StaffCommand() {
  const [staff,       setStaff]       = useState<any[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [loadError,   setLoadError]   = useState("");
  const [showModal,   setShowModal]   = useState(false);
  const [saving,      setSaving]      = useState(false);
  const [formError,   setFormError]   = useState("");
  const [form,        setForm]        = useState({ name:"", email:"", role:"bde", timezone:"Europe/London" });
  const [openPerms,   setOpenPerms]   = useState<string|null>(null);
  const [savingPerms, setSavingPerms] = useState<string|null>(null);
  const [syncedId,   setSyncedId]   = useState<string|null>(null);
  const [inviting,    setInviting]    = useState<string|null>(null);
  const [genLinkId,   setGenLinkId]   = useState<string|null>(null);
  const [genLinks,    setGenLinks]    = useState<Record<string,string>>({});
  const [copied,      setCopied]      = useState<string|null>(null);
  const [inviteMsg,   setInviteMsg]   = useState<{id:string,msg:string,ok:boolean}|null>(null);
  const navigate = useNavigate();

  const load = () => {
    setLoading(true); setLoadError("");
    post("get_staff").then(r => {
      setStaff((r as any).staff || []);
      if ((r as any).error) setLoadError((r as any).error);
      setLoading(false);
    });
  };
  useEffect(() => { load(); }, []);

  const handleAdd = async () => {
    if (!form.name.trim()) { setFormError("Name is required"); return; }
    setSaving(true); setFormError("");
    const r = await post("create_staff", {
      name: form.name.trim(),
      email: form.email.trim() || undefined,
      role: form.role, timezone: form.timezone,
      permissions: ROLE_DEFAULTS[form.role] || {},
    });
    setSaving(false);
    if ((r as any).success) {
      setShowModal(false);
      setForm({ name:"", email:"", role:"bde", timezone:"Europe/London" });
      load();
    } else {
      setFormError((r as any).error || "Failed to create staff");
    }
  };

  const sendInvite = async (s: any) => {
    if (!s.email) { setInviteMsg({id:s.id, msg:"Add an email to this staff member first", ok:false}); return; }
    setInviting(s.id); setInviteMsg(null);
    const r = await post("invite_staff", { staffId:s.id, email:s.email, name:s.name });
    setInviting(null);
    setInviteMsg({ id:s.id, msg:(r as any).message||(r as any).error||"Unknown response", ok:!!(r as any).success });
    setTimeout(() => setInviteMsg(null), 5000);
  };

  const generateLoginLink = async (s: any) => {
    if (!s.email) return;
    setGenLinkId(s.id);
    const r = await post("generate_staff_link", { staffId:s.id, email:s.email, name:s.name });
    setGenLinkId(null);
    if ((r as any).success) {
      setGenLinks(prev => ({...prev, [s.id]: (r as any).link}));
    } else {
      setInviteMsg({id:s.id, msg:(r as any).error||"Failed to generate link", ok:false});
    }
  };

  const copyLink = (id: string) => {
    const link = genLinks[id];
    if (!link) return;
    navigator.clipboard.writeText(link).catch(() => {
      const el = document.createElement('textarea');
      el.value = link; document.body.appendChild(el); el.select();
      document.execCommand('copy'); document.body.removeChild(el);
    });
    setCopied(id);
    setTimeout(() => setCopied(null), 3000);
  };

  const togglePerm = async (s: any, key: string) => {
    const updated = { ...(s.permissions||{}), [key]: !s.permissions?.[key] };
    setSavingPerms(s.id);
    await post("update_staff_permissions", { staffId:s.id, permissions:updated });
    setStaff(prev => prev.map(m => m.id===s.id ? {...m, permissions:updated} : m));
    setSavingPerms(null);
  };

  const applyRoleDefaults = async (s: any) => {
    const defaults = ROLE_DEFAULTS[s.role] || {};
    setSavingPerms(s.id);
    await post("update_staff_permissions", { staffId:s.id, permissions:defaults });
    setStaff(prev => prev.map(m => m.id===s.id ? {...m, permissions:defaults} : m));
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
            <p className="text-sm text-muted-foreground mt-1">Manage team members, permissions, and logins</p>
          </div>
          <button onClick={() => { setShowModal(true); setFormError(""); }}
            className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90">
            + Add Staff
          </button>
        </div>

        {loadError && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-sm text-red-400">
            ⚠ {loadError}
          </div>
        )}

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
                    onChange={e => setForm(f=>({...f,name:e.target.value}))} autoFocus
                    onKeyDown={e => e.key==="Enter" && handleAdd()} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Email — required to send login invite</label>
                  <input className={inp} placeholder="aryan@seoseason.com" type="email" value={form.email}
                    onChange={e => setForm(f=>({...f,email:e.target.value}))} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Role</label>
                  <select className={inp} value={form.role} onChange={e => setForm(f=>({...f,role:e.target.value}))}>
                    {ROLES.map(r => <option key={r} value={r}>{r.replace(/_/g," ").toUpperCase()}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Timezone</label>
                  <select className={inp} value={form.timezone} onChange={e => setForm(f=>({...f,timezone:e.target.value}))}>
                    {["Europe/London","Asia/Kolkata","America/New_York","America/Los_Angeles","Asia/Dubai","Australia/Sydney"]
                      .map(tz => <option key={tz} value={tz}>{tz.replace(/_/g," ")}</option>)}
                  </select>
                </div>
                <p className="text-xs text-muted-foreground">Default {form.role.replace(/_/g," ")} permissions applied. You can customise after adding.</p>
                {formError && <p className="text-xs text-red-400">{formError}</p>}
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
        ) : staff.length === 0 && !loadError ? (
          <div className="text-center py-16">
            <div className="text-4xl mb-4">👥</div>
            <p className="text-sm text-muted-foreground mb-4">No staff yet. Add your first team member.</p>
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
                  <div className="flex items-center gap-4 p-4">
                    <div className="h-10 w-10 rounded-xl flex items-center justify-center text-sm font-bold flex-shrink-0"
                      style={{background:`${color}15`,color,border:`1px solid ${color}30`}}>
                      {s.avatar_initials || s.name?.slice(0,2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold">{s.name}</div>
                      <div className="text-xs capitalize" style={{color}}>{s.role?.replace(/_/g," ")}</div>
                      {s.email
                        ? <div className="text-xs text-muted-foreground">{s.email}</div>
                        : <div className="text-xs text-yellow-500">⚠ No email — can&apos;t send login invite</div>}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
                      {inviteMsg?.id===s.id && (
                        <span className={`text-xs ${inviteMsg.ok?"text-green-400":"text-red-400"}`}>{inviteMsg.msg}</span>
                      )}
                      <button onClick={() => generateLoginLink(s)} disabled={genLinkId===s.id||!s.email}
                        title={!s.email ? "Add email first" : "Generate a login link to share"}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium border border-border hover:border-primary/40 transition-colors disabled:opacity-50">
                        {genLinkId===s.id ? "Generating..." : "🔗 Get Login Link"}
                      </button>
                      <button onClick={() => setOpenPerms(isOpen ? null : s.id)}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium border border-border hover:border-primary/40 transition-colors">
                        {isOpen ? "✕ Close" : "🔑 Permissions"}
                      </button>
                      <span className="text-xs text-muted-foreground">{enabled}/{PANELS.length}</span>
                    </div>
                  </div>

                  {/* Generated login link */}
                  {genLinks[s.id] && (
                    <div className="mx-4 mb-3 p-3 rounded-xl border border-border bg-muted/30">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-green-400">✓ Login link ready — share this with {s.name}</span>
                        <button onClick={() => setGenLinks(prev => { const n={...prev}; delete n[s.id]; return n; })}
                          className="text-xs text-muted-foreground hover:text-foreground">✕</button>
                      </div>
                      <div className="flex gap-2">
                        <input readOnly value={genLinks[s.id]}
                          className="flex-1 px-2 py-1.5 rounded-lg bg-background border border-border text-xs text-muted-foreground font-mono truncate"
                          onClick={e => (e.target as HTMLInputElement).select()} />
                        <button onClick={() => copyLink(s.id)}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium border border-green-500/40 text-green-400 hover:bg-green-500/10 flex-shrink-0">
                          {copied===s.id ? "✓ Copied!" : "Copy"}
                        </button>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">⚠ Link expires after first use. Generate a new one if needed.</p>
                    </div>
                  )}

                  {isOpen && (
                    <div className="border-t border-border p-4 bg-muted/20">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm font-semibold">Panel Access — {enabled} of {PANELS.length} enabled</span>{syncedId===s.id&&<span className="text-xs text-green-400 ml-2">✓ Synced to BDE live</span>}
                        <button onClick={() => applyRoleDefaults(s)} disabled={savingPerms===s.id}
                          className="text-xs px-3 py-1.5 rounded-lg border border-border hover:border-primary/40">
                          ↺ Reset to {s.role?.replace(/_/g," ")} defaults
                        </button>
                      </div>
                      <div className="grid gap-2" style={{gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))"}}>
                        {PANELS.map(panel => {
                          const on = !!perms[panel.key];
                          return (
                            <button key={panel.key} onClick={() => togglePerm(s, panel.key)}
                              disabled={savingPerms===s.id}
                              className="flex items-start gap-3 p-3 rounded-xl border text-left transition-all"
                              style={{borderColor:on?`${color}40`:"var(--border)",background:on?`${color}08`:"transparent",opacity:savingPerms===s.id?0.6:1}}>
                              <div className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0 mt-0.5"
                                style={{background:on?color:"transparent",border:`1.5px solid ${on?color:"#555"}`}}>
                                {on && <span className="text-white text-xs font-bold leading-none">✓</span>}
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
