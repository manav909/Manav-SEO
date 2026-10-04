/* Admin → Client plans. Pick a client project, pick its plan, then flip the
   optional features on or off — like a pilot's switch panel. Mandatory
   features are always on; features outside the plan can't be switched on.
   The server applies the same rules (api/lib/panel-plans.ts). */

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Lock, Check } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

type PlanId = 'starter' | 'growth' | 'authority' | 'enterprise';
type Availability = 'mandatory' | 'optional' | 'none';
interface Feature { key: string; label: string; unlocks: string; monthlyCost: number; availability: Record<PlanId, Availability> }
interface Plan { id: PlanId; label: string; limits: { goals: number | null; sites: number | null; seats: number | null } }

async function engine(body: object) {
  const r = await fetch('/api/task-engine', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return r.json().catch(() => ({ success: false, error: 'Unexpected server reply' }));
}

const limitText = (n: number | null, one: string, many: string) => (n === null ? `Unlimited ${many}` : `${n} ${n === 1 ? one : many}`);

export default function PlanSwitches({ clients, projects }: { clients: any[]; projects: any[] }) {
  const [projectId, setProjectId] = useState('');
  const [plans, setPlans] = useState<Plan[]>([]);
  const [features, setFeatures] = useState<Feature[]>([]);
  const [plan, setPlan] = useState<PlanId>('starter');
  const [switches, setSwitches] = useState<Record<string, boolean>>({});
  const [previews, setPreviews] = useState(true);
  const [assigned, setAssigned] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [invite, setInvite] = useState({ name: '', email: '' });
  const [inviting, setInviting] = useState(false);
  const [inviteResult, setInviteResult] = useState<{ link: string; emailed: boolean } | null>(null);

  const sendInvite = async () => {
    setInviting(true); setInviteResult(null);
    const r = await engine({ action: 'panel_invite_client', projectId, ...invite });
    setInviting(false);
    if (!r?.success) { toast({ title: 'Invite not sent', description: r?.error, variant: 'destructive' }); return; }
    setInviteResult({ link: r.link, emailed: r.emailed });
    toast({ title: r.emailed ? 'Invite emailed' : 'Invite ready', description: r.emailed ? `${invite.email} can sign in now.` : 'Email isn\'t set up — copy the link and send it yourself.' });
  };

  useEffect(() => {
    engine({ action: 'panel_catalog' }).then((r) => {
      if (r?.success) { setPlans(r.plans); setFeatures(r.features); }
    });
  }, []);

  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    engine({ action: 'panel_get_plan', projectId }).then((r) => {
      setLoading(false);
      if (!r?.success) { toast({ title: 'Could not load plan', description: r?.error, variant: 'destructive' }); return; }
      setPlan(r.panel.plan);
      setSwitches(r.panel.switches || {});
      setPreviews(r.panel.upgrade_previews);
      setAssigned(r.panel.plan_assigned);
    });
  }, [projectId]);

  const monthlyCost = useMemo(() => features.reduce((sum, f) => {
    const a = f.availability[plan];
    return sum + (a === 'mandatory' || (a === 'optional' && switches[f.key]) ? f.monthlyCost : 0);
  }, 0), [features, plan, switches]);

  const save = async () => {
    setSaving(true);
    const r = await engine({ action: 'panel_set_plan', projectId, plan, switches, upgradePreviews: previews });
    setSaving(false);
    if (!r?.success) { toast({ title: 'Not saved', description: r?.error, variant: 'destructive' }); return; }
    setAssigned(true);
    toast({ title: 'Plan saved', description: 'The client sees the change next time their panel loads.' });
  };

  const current = plans.find((p) => p.id === plan);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-card/60 p-5 space-y-2">
        <div className="text-sm font-semibold">Client project</div>
        <select value={projectId} onChange={(e) => setProjectId(e.target.value)}
          className="w-full h-10 rounded-md border border-border bg-background/60 text-sm px-3">
          <option value="">— Choose project —</option>
          {(clients || []).filter((c: any) => c?.id).map((c: any) => {
            const cp = projects.filter((p) => p.client_id === c.id);
            if (!cp.length) return null;
            return (
              <optgroup key={c.id} label={`${c.name}${c.company ? ` — ${c.company}` : ''}`}>
                {cp.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.url})</option>)}
              </optgroup>
            );
          })}
        </select>
      </div>

      {projectId && loading && <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}

      {projectId && !loading && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {plans.map((p) => (
              <button key={p.id} onClick={() => setPlan(p.id)}
                className={`text-left rounded-2xl border p-4 transition-all ${plan === p.id ? 'border-primary bg-primary/10' : 'border-border bg-card/60 hover:border-primary/50'}`}>
                <div className="font-semibold">{p.label}</div>
                <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                  <div>{limitText(p.limits.goals, 'active goal', 'active goals')}</div>
                  <div>{limitText(p.limits.sites, 'site', 'sites')} · {limitText(p.limits.seats, 'seat', 'seats')}</div>
                </div>
              </button>
            ))}
          </div>
          {!assigned && <div className="text-xs text-muted-foreground">This client has no plan saved yet — they currently get Starter.</div>}

          <div className="rounded-2xl border border-border bg-card/60 divide-y divide-border">
            {features.map((f) => {
              const a = f.availability[plan];
              const on = a === 'mandatory' || (a === 'optional' && !!switches[f.key]);
              return (
                <div key={f.key} className="flex items-center justify-between gap-4 px-5 py-3">
                  <div className="min-w-0">
                    <div className={`text-sm font-medium ${a === 'none' ? 'text-muted-foreground' : ''}`}>{f.label}</div>
                    <div className="text-xs text-muted-foreground">{f.unlocks}{f.monthlyCost ? ` · about $${f.monthlyCost}/month in AI and data` : ''}</div>
                  </div>
                  {a === 'mandatory' && <span className="shrink-0 inline-flex items-center gap-1 text-xs font-semibold text-primary"><Check className="h-3.5 w-3.5" />Included</span>}
                  {a === 'none' && <span className="shrink-0 inline-flex items-center gap-1 text-xs text-muted-foreground"><Lock className="h-3.5 w-3.5" />Not in {current?.label}</span>}
                  {a === 'optional' && (
                    <button role="switch" aria-checked={on} aria-label={f.label}
                      onClick={() => setSwitches((s) => ({ ...s, [f.key]: !s[f.key] }))}
                      className={`shrink-0 relative h-6 w-11 rounded-full transition-colors ${on ? 'bg-primary' : 'bg-muted'}`}>
                      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-background shadow transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <label className="flex items-center gap-3 text-sm">
            <input type="checkbox" checked={previews} onChange={(e) => setPreviews(e.target.checked)} className="h-4 w-4" />
            Show features outside the plan as a locked preview the client can ask about (off = hide them completely)
          </label>

          <div className="flex items-center justify-between gap-4">
            <div className="text-xs text-muted-foreground">Estimated running cost for this client: about ${monthlyCost}/month</div>
            <button onClick={save} disabled={saving}
              className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50 inline-flex items-center gap-2">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}Save plan
            </button>
          </div>

          <div className="rounded-2xl border border-border bg-card/60 p-5 space-y-3">
            <div className="text-sm font-semibold">Invite the client to their panel</div>
            <div className="text-xs text-muted-foreground">Switches their portal on and emails a sign-in link (no password). Afterwards they can always sign in at /c/login with this email.</div>
            <div className="grid sm:grid-cols-[1fr_1fr_auto] gap-2">
              <input className="h-10 rounded-md border border-border bg-background/60 text-sm px-3 text-foreground" placeholder="Client's name" value={invite.name} onChange={(e) => setInvite({ ...invite, name: e.target.value })} aria-label="Client's name" />
              <input className="h-10 rounded-md border border-border bg-background/60 text-sm px-3 text-foreground" placeholder="client@business.com" type="email" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} aria-label="Client's email" />
              <button onClick={sendInvite} disabled={inviting || !invite.email} className="px-4 h-10 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50 inline-flex items-center gap-2">
                {inviting && <Loader2 className="h-4 w-4 animate-spin" />}Send invite
              </button>
            </div>
            {inviteResult && (
              <div className="text-xs rounded-lg bg-muted/50 p-3 space-y-1">
                <div>{inviteResult.emailed ? 'Emailed. You can also share this link:' : 'Copy this link and send it to the client:'}</div>
                <div className="flex gap-2 items-center">
                  <code className="truncate flex-1">{inviteResult.link}</code>
                  <button onClick={() => navigator.clipboard?.writeText(inviteResult.link)} className="px-2 py-1 rounded border border-border">Copy</button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
