/* ════════════════════════════════════════════════════════════════
   api/lib/panel-plans.ts
   Plan switches for the client panel ("pilot panel").

   Each client project has a plan. The plan fixes which features are
   mandatory (always on), optional (an owner switches them on per client)
   or not offered. The server resolves this for every client request, so
   a switched-off feature can't be reached by any route, and the admin
   console reads the same catalogue to draw its switches.

   Stored on project_entitlements (see supabase-migrations/panel_plans.sql):
     panel_plan             text     starter | growth | authority | enterprise
     panel_switches         jsonb    { featureKey: true } for optional features
     panel_upgrade_previews boolean  show features outside the plan as a
                                     locked preview (true) or hide them (false)
   Brand Studio keeps its own tier on the same row; the "brand_studio"
   switch here only decides whether the client panel links to it.
═══════════════════════════════════════════════════════════════ */

import { db } from "./db.js";

export type PlanId = "starter" | "growth" | "authority" | "enterprise";
export type Availability = "mandatory" | "optional" | "none";

export interface PanelFeature {
  key: string;
  label: string;
  /** What it unlocks, in plain words — shown next to the switch. */
  unlocks: string;
  /** Rough monthly AI/data cost per client in USD, shown to the owner. */
  monthlyCost: number;
  availability: Record<PlanId, Availability>;
}

const ALL_MANDATORY: Record<PlanId, Availability> = { starter: "mandatory", growth: "mandatory", authority: "mandatory", enterprise: "mandatory" };

export const PANEL_FEATURES: PanelFeature[] = [
  { key: "home",            label: "Home & wins",                  unlocks: "Good news first, milestones, this month's numbers", monthlyCost: 0, availability: ALL_MANDATORY },
  { key: "strategist",      label: "Talk to Manvisha",             unlocks: "Messages with the strategist, AI answers checked by the team", monthlyCost: 2, availability: ALL_MANDATORY },
  { key: "calls",           label: "Book a call & call notes",     unlocks: "Calendar booking, recorded summaries, tracked actions", monthlyCost: 1, availability: ALL_MANDATORY },
  { key: "reports",         label: "Monthly reports",              unlocks: "Monthly report with real Google numbers", monthlyCost: 0, availability: ALL_MANDATORY },
  { key: "connections",     label: "Google connections",           unlocks: "Search Console, Analytics and PageSpeed data", monthlyCost: 0, availability: ALL_MANDATORY },
  { key: "site_health",     label: "Site health",                  unlocks: "Health score and fix list", monthlyCost: 1, availability: ALL_MANDATORY },
  { key: "goals",           label: "Goals & wins",                 unlocks: "Goals with progress (limit set by the plan)", monthlyCost: 0, availability: ALL_MANDATORY },
  { key: "improvements",    label: "Improvements & orders",        unlocks: "Priced ideas, basket, offers and order tracking", monthlyCost: 0, availability: ALL_MANDATORY },
  { key: "keywords",        label: "Keywords & content",           unlocks: "Daily keyword positions and content ideas", monthlyCost: 3,
    availability: { starter: "optional", growth: "mandatory", authority: "mandatory", enterprise: "mandatory" } },
  { key: "ai_visibility",   label: "AI visibility (GEO/AEO)",      unlocks: "How AI assistants mention the business", monthlyCost: 6,
    availability: { starter: "optional", growth: "optional", authority: "mandatory", enterprise: "mandatory" } },
  { key: "backlinks",       label: "Backlinks & authority",        unlocks: "Link gap, outreach plan, links earned", monthlyCost: 8,
    availability: { starter: "none", growth: "optional", authority: "mandatory", enterprise: "mandatory" } },
  { key: "deep_analysis",   label: "Deep analysis results",        unlocks: "Competitor and SERP deep dives", monthlyCost: 5,
    availability: { starter: "none", growth: "optional", authority: "mandatory", enterprise: "mandatory" } },
  { key: "custom_reports",  label: "Custom reports on request",    unlocks: "Ask for any report in plain English", monthlyCost: 3,
    availability: { starter: "none", growth: "optional", authority: "mandatory", enterprise: "mandatory" } },
  { key: "white_label",     label: "White-label PDF & share links",unlocks: "Reports in the client's own brand", monthlyCost: 0,
    availability: { starter: "none", growth: "optional", authority: "optional", enterprise: "mandatory" } },
  { key: "brand_studio",    label: "Brand Studio add-on",          unlocks: "Brand documents, approvals and uploads", monthlyCost: 4,
    availability: { starter: "none", growth: "optional", authority: "optional", enterprise: "optional" } },
];

export interface PlanLimits { goals: number | null; sites: number | null; seats: number | null }

export const PANEL_PLANS: Record<PlanId, { label: string; limits: PlanLimits }> = {
  starter:    { label: "Starter",    limits: { goals: 1,  sites: 1, seats: 1 } },
  growth:     { label: "Growth",     limits: { goals: 3,  sites: 2, seats: 3 } },
  authority:  { label: "Authority",  limits: { goals: 10, sites: 5, seats: 10 } },
  enterprise: { label: "Enterprise", limits: { goals: null, sites: null, seats: null } },
};

const DEFAULT_PLAN: PlanId = "starter";

export function isPlanId(v: unknown): v is PlanId {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(PANEL_PLANS, v);
}

export interface PanelResolution {
  project_id: string;
  plan: PlanId;
  plan_label: string;
  plan_assigned: boolean;
  /** featureKey → on/off after applying the plan and the owner's switches */
  features: Record<string, boolean>;
  /** featureKey → availability in this plan (for locked previews) */
  availability: Record<string, Availability>;
  switches: Record<string, boolean>;
  limits: PlanLimits;
  upgrade_previews: boolean;
}

/** Pure resolution — plan + switches → effective features. */
export function resolvePanel(projectId: string, row: any): PanelResolution {
  const plan: PlanId = isPlanId(row?.panel_plan) ? row.panel_plan : DEFAULT_PLAN;
  const switches: Record<string, boolean> = (row?.panel_switches && typeof row.panel_switches === "object") ? row.panel_switches : {};
  const features: Record<string, boolean> = {};
  const availability: Record<string, Availability> = {};
  for (const f of PANEL_FEATURES) {
    const a = f.availability[plan];
    availability[f.key] = a;
    features[f.key] = a === "mandatory" ? true : a === "optional" ? switches[f.key] === true : false;
  }
  return {
    project_id: projectId,
    plan,
    plan_label: PANEL_PLANS[plan].label,
    plan_assigned: isPlanId(row?.panel_plan),
    features,
    availability,
    switches,
    limits: PANEL_PLANS[plan].limits,
    upgrade_previews: row?.panel_upgrade_previews !== false,
  };
}

export async function getPanelPlan(projectId: string): Promise<PanelResolution> {
  /* select("*") so a database without the new columns still answers
     (everything resolves to the default plan). */
  const { data } = await db().from("project_entitlements")
    .select("*").eq("project_id", projectId).maybeSingle();
  return resolvePanel(projectId, data);
}

/** Server-side gate for client-panel actions. */
export async function clientFeatureAllowed(projectId: string, key: string): Promise<boolean> {
  const r = await getPanelPlan(projectId);
  return r.features[key] === true;
}

const MIGRATION_HINT = "The plan columns are missing in the database. Run supabase-migrations/panel_plans.sql in the Supabase SQL editor, then try again.";

/** Owner-only: set a project's plan and optional switches. Switches for
 *  mandatory or unavailable features are ignored, so the stored state
 *  can never contradict the plan. */
export async function setPanelPlan(body: any): Promise<any> {
  const projectId = String(body?.projectId || "");
  if (!projectId) return { success: false, error: "projectId required" };
  if (!isPlanId(body?.plan)) return { success: false, error: `plan must be one of: ${Object.keys(PANEL_PLANS).join(", ")}` };
  const plan: PlanId = body.plan;

  const incoming = (body?.switches && typeof body.switches === "object") ? body.switches : {};
  const switches: Record<string, boolean> = {};
  for (const f of PANEL_FEATURES) {
    if (f.availability[plan] === "optional" && incoming[f.key] === true) switches[f.key] = true;
  }

  const payload: any = { project_id: projectId, panel_plan: plan, panel_switches: switches };
  if (typeof body?.upgradePreviews === "boolean") payload.panel_upgrade_previews = body.upgradePreviews;

  const { error } = await db().from("project_entitlements").upsert(payload, { onConflict: "project_id" });
  if (error) {
    const missing = /panel_(plan|switches|upgrade_previews)/.test(error.message || "") || error.code === "PGRST204" || error.code === "42703";
    return { success: false, error: missing ? MIGRATION_HINT : error.message, code: missing ? "migration_needed" : undefined };
  }
  return { success: true, panel: await getPanelPlan(projectId) };
}

export function panelCatalog() {
  return {
    plans: Object.entries(PANEL_PLANS).map(([id, p]) => ({ id, label: p.label, limits: p.limits })),
    features: PANEL_FEATURES,
  };
}

/** Owner-only: switch a client's portal on and email them a sign-in invite
 *  in one go. Returns the link too, so it can be shared by hand. */
async function inviteClient(body: any, siteUrl: string, invitedBy: string | null) {
  const projectId = String(body?.projectId || "");
  const email = String(body?.email || "").trim().toLowerCase();
  if (!projectId) return { success: false, error: "projectId required" };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { success: false, error: "Enter the client's email address." };
  const { error: entErr } = await db().from("project_entitlements").upsert({ project_id: projectId, client_portal_enabled: true }, { onConflict: "project_id" });
  if (entErr) return { success: false, error: entErr.message };
  const { bsInviteClientUser } = await import("./brand-studio-collab.js");
  const r = await bsInviteClientUser({ projectId, email, role: "client_executive", invitedBy, notes: body?.name ? `Name: ${String(body.name).slice(0, 120)}` : undefined });
  if (!r?.success) return r;
  const link = `${siteUrl.replace(/\/$/, "")}/c/invite/${r.invite_token}`;
  let emailed = false;
  const key = process.env.RESEND_API_KEY;
  if (key) {
    const { data: project } = await db().from("projects").select("name").eq("id", projectId).maybeSingle();
    const strategist = process.env.STRATEGIST_NAME || "Manvisha";
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.CLIENT_LOGIN_FROM || "SEO Season <noreply@seoseason.com>", to: [email],
        subject: `Your SEO Season panel for ${(project as any)?.name || "your website"}`,
        text: `Hi${body?.name ? ` ${String(body.name).split(" ")[0]}` : ""},\n\nYour SEO Season panel is ready — your results, wins and a direct line to ${strategist}, your strategist.\n\nOpen it here (no password needed):\n${link}\n\nNext time, just go to ${siteUrl.replace(/\/$/, "")}/c/login and enter this email.\n\nSEO Season`,
      }),
    }).catch(() => null);
    emailed = !!res && res.ok;
  }
  return { success: true, link, emailed, was_regenerated: !!r.was_regenerated };
}

export async function handlePanelPlans(action: string, body: any, ctx: { siteUrl?: string; staffEmail?: string | null } = {}): Promise<any | null> {
  switch (action) {
    case "panel_invite_client": return inviteClient(body, ctx.siteUrl || process.env.APP_URL || "https://seoseason.com", ctx.staffEmail || null);
    case "panel_catalog":  return { success: true, ...panelCatalog() };
    case "panel_get_plan": {
      if (!body?.projectId) return { success: false, error: "projectId required" };
      return { success: true, panel: await getPanelPlan(String(body.projectId)), ...panelCatalog() };
    }
    case "panel_set_plan": return setPanelPlan(body);
    default: return null;
  }
}
