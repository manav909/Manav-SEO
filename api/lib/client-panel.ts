/* ════════════════════════════════════════════════════════════════
   api/lib/client-panel.ts
   The new client panel (/c/home …) and its "Talk to Manav S" thread.

   Client actions (cp_*) are public at the router and authenticate with
   the client's session token (withClientSession), then check the
   project's plan switches (panel-plans.ts) before returning anything.
   Every query is scoped to the session's own project — the project id is
   never taken from the request body.

   Staff actions (cps_*) run behind the normal team login.

   Messages live in client_messages (supabase-migrations/client_messages.sql):
     author_type  client | staff | ai_draft
     status       sent | draft | used | discarded
   Clients only ever see client + staff messages. When a client writes,
   an AI draft reply is prepared for the team; a person reads, edits and
   sends it — nothing AI-written reaches a client unreviewed.
═══════════════════════════════════════════════════════════════ */

import { db } from "./db.js";
import { withClientSession } from "./brand-studio-client.js";
import { getPanelPlan, type PanelResolution } from "./panel-plans.js";
import { createNotification } from "./brand-studio-collab.js";

export const STRATEGIST_NAME = process.env.STRATEGIST_NAME || "Manav S";
const MIGRATION_HINT = "Messages aren't set up yet. Run supabase-migrations/client_messages.sql in the Supabase SQL editor.";
const MAX_MESSAGE = 4000;

/* ─── Client session + plan gate ───────────────────────────────── */

async function clientContext(body: any, feature?: string): Promise<
  { ok: true; user: any; panel: PanelResolution } | { ok: false; result: any }
> {
  const { user, error } = await withClientSession(body);
  if (!user) return { ok: false, result: { success: false, error: error || "Please sign in again.", code: "session" } };
  const panel = await getPanelPlan(user.project_id);
  if (feature && !panel.features[feature]) {
    return { ok: false, result: { success: false, error: "This isn't part of your plan yet.", code: "not_in_plan", feature } };
  }
  return { ok: true, user, panel };
}

function isMissingTable(err: any): boolean {
  const m = String(err?.message || "");
  return err?.code === "42P01" || err?.code === "PGRST205" || /client_messages/.test(m) && /does not exist|schema cache/.test(m);
}

/* ─── Numbers & wins (measured data only) ─────────────────────── */

export async function loadNumbers(projectId: string) {
  try {
    const { bsGetAnalyticsIntel } = await import("./pm-analytics-intel-orchestrator.js");
    const r = await bsGetAnalyticsIntel({ projectId });
    const intel = r?.intel;
    if (!intel) return { numbers: null, wins: [] as any[] };
    const cur = intel.periods?.last_30d;
    const d = intel.deltas?.last_30d_vs_previous;
    const pick = (k: string) => d?.[k] ? { from: d[k].from, to: d[k].to, pct: d[k].pctChange, direction: d[k].direction } : null;
    const numbers = cur ? {
      window: "Last 30 days",
      clicks: cur.gscClicks ?? null,
      impressions: cur.gscImpressions ?? null,
      avgPosition: cur.gscAvgPosition ?? null,
      sessions: cur.ga4Sessions ?? null,
      conversions: cur.ga4Conversions ?? null,
      change: { clicks: pick("clicks"), impressions: pick("impressions"), position: pick("position"), sessions: pick("sessions"), conversions: pick("conversions") },
    } : null;
    const wins = (Array.isArray(intel.risingStars) ? intel.risingStars : [])
      .filter((s: any) => ["page_2_to_1", "ranking_climber", "first_appearance", "page_3_to_2"].includes(s?.opportunity))
      .slice(0, 6)
      .map((s: any) => ({ query: s.query, position: s.position, kind: s.opportunity, clicks: s.currentClicks }));
    return { numbers, wins };
  } catch {
    return { numbers: null, wins: [] as any[] };
  }
}

export async function loadGoals(projectId: string) {
  const { data: goals } = await db().from("analytics_goals")
    .select("id,name,description,metric,target_value,target_date,baseline_value,status,shared_with_client")
    .eq("project_id", projectId).eq("shared_with_client", true)
    .order("target_date", { ascending: true }).limit(20);
  const list = (goals || []) as any[];
  if (!list.length) return [];
  const { data: progress } = await db().from("analytics_goal_progress")
    .select("goal_id,actual_value,on_track,recorded_at")
    .in("goal_id", list.map((g) => g.id))
    .order("recorded_at", { ascending: false }).limit(200);
  const latest: Record<string, any> = {};
  for (const p of (progress || []) as any[]) if (!latest[p.goal_id]) latest[p.goal_id] = p;
  return list.map((g) => ({
    id: g.id, name: g.name, description: g.description, metric: g.metric,
    target: g.target_value, targetDate: g.target_date, baseline: g.baseline_value, status: g.status,
    current: latest[g.id]?.actual_value ?? null, onTrack: latest[g.id]?.on_track ?? null, updatedAt: latest[g.id]?.recorded_at ?? null,
  }));
}

async function loadSharedReports(projectId: string) {
  const { data } = await db().from("client_reports")
    .select("id,title,period_start,period_end,share_token,shared_at")
    .eq("project_id", projectId).eq("status", "shared")
    .order("shared_at", { ascending: false }).limit(24);
  return ((data || []) as any[]).filter((r) => r.share_token).map((r) => ({
    id: r.id, title: r.title, periodStart: r.period_start, periodEnd: r.period_end, sharedAt: r.shared_at, link: `/r/${r.share_token}`,
  }));
}

async function unreadFromTeam(projectId: string): Promise<number> {
  const { count, error } = await db().from("client_messages")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId).eq("author_type", "staff").is("read_by_client_at", null);
  return error ? 0 : (count || 0);
}

/* ─── Client actions ──────────────────────────────────────────── */

async function cpHome(body: any) {
  const c = await clientContext(body, "home");
  if (!c.ok) return (c as { result: any }).result;
  const pid = c.user.project_id;
  const [{ data: project }, nums, goals, reports, unread] = await Promise.all([
    db().from("projects").select("id,name,url").eq("id", pid).maybeSingle(),
    loadNumbers(pid),
    c.panel.features.goals ? loadGoals(pid).catch(() => []) : Promise.resolve([]),
    c.panel.features.reports ? loadSharedReports(pid).catch(() => []) : Promise.resolve([]),
    unreadFromTeam(pid).catch(() => 0),
  ]);
  const { listWins } = await import("./client-wins.js");
  const milestones = await listWins(pid, 6).catch(() => []);
  return {
    success: true,
    user: { name: c.user.display_name || c.user.email, email: c.user.email },
    project: project || { id: pid },
    strategist: { name: STRATEGIST_NAME },
    panel: c.panel,
    numbers: nums.numbers,
    wins: nums.wins,
    milestones,
    goals: (goals as any[]).slice(0, 3),
    latestReport: (reports as any[])[0] || null,
    unreadMessages: unread,
  };
}

async function cpGoals(body: any) {
  const c = await clientContext(body, "goals");
  if (!c.ok) return (c as { result: any }).result;
  const [goals, nums] = await Promise.all([loadGoals(c.user.project_id).catch(() => []), loadNumbers(c.user.project_id)]);
  return { success: true, goals, wins: nums.wins, limit: c.panel.limits.goals };
}

async function cpReports(body: any) {
  const c = await clientContext(body, "reports");
  if (!c.ok) return (c as { result: any }).result;
  return { success: true, reports: await loadSharedReports(c.user.project_id).catch(() => []) };
}

async function cpSettingsUpdate(body: any) {
  const c = await clientContext(body);
  if (!c.ok) return (c as { result: any }).result;
  const name = String(body?.displayName || "").trim().slice(0, 200);
  if (!name) return { success: false, error: "Please enter your name." };
  const { error } = await db().from("client_users").update({ display_name: name }).eq("id", c.user.id);
  if (error) return { success: false, error: error.message };
  return { success: true, name };
}

async function cpMessagesList(body: any) {
  const c = await clientContext(body, "strategist");
  if (!c.ok) return (c as { result: any }).result;
  const pid = c.user.project_id;
  const { data, error } = await db().from("client_messages")
    .select("id,author_type,author_label,body,created_at")
    .eq("project_id", pid).in("author_type", ["client", "staff"]).eq("status", "sent")
    .order("created_at", { ascending: true }).limit(300);
  if (error) return isMissingTable(error) ? { success: true, messages: [], strategist: { name: STRATEGIST_NAME } } : { success: false, error: error.message };
  /* Opening the thread marks the team's replies as read. */
  db().from("client_messages").update({ read_by_client_at: new Date().toISOString() })
    .eq("project_id", pid).eq("author_type", "staff").is("read_by_client_at", null).then(() => {}, () => {});
  return {
    success: true,
    strategist: { name: STRATEGIST_NAME },
    messages: (data || []).map((m: any) => ({ id: m.id, from: m.author_type === "client" ? "client" : "team", name: m.author_label, body: m.body, at: m.created_at })),
  };
}

async function cpMessageSend(body: any) {
  const c = await clientContext(body, "strategist");
  if (!c.ok) return (c as { result: any }).result;
  const text = String(body?.body || "").trim();
  if (!text) return { success: false, error: "Please write a message." };
  if (text.length > MAX_MESSAGE) return { success: false, error: `Please keep messages under ${MAX_MESSAGE} characters.` };
  const pid = c.user.project_id;
  const { data, error } = await db().from("client_messages").insert({
    project_id: pid, client_user_id: c.user.id, author_type: "client",
    author_label: c.user.display_name || c.user.email, body: text, status: "sent",
  }).select("id,created_at").single();
  if (error || !data) return { success: false, error: isMissingTable(error) ? MIGRATION_HINT : (error?.message || "Could not send") };

  await createNotification({
    projectId: pid, recipientType: "staff", recipientId: `pm:${pid}`, kind: "client_message",
    title: `New message from ${c.user.display_name || c.user.email}`, body: text.slice(0, 300),
  });
  /* Prepare a reply for the team to review — capped so the client isn't kept waiting. */
  await Promise.race([draftReply(pid).catch(() => null), new Promise((r) => setTimeout(r, 20_000))]);
  return { success: true, message: { id: (data as any).id, from: "client", body: text, at: (data as any).created_at } };
}

/* ─── AI draft for the team ───────────────────────────────────── */

export async function draftReply(projectId: string): Promise<string | null> {
  const [{ data: project }, { data: history }, nums, goals] = await Promise.all([
    db().from("projects").select("name,url").eq("id", projectId).maybeSingle(),
    db().from("client_messages").select("author_type,author_label,body,created_at")
      .eq("project_id", projectId).in("author_type", ["client", "staff"]).eq("status", "sent")
      .order("created_at", { ascending: false }).limit(12),
    loadNumbers(projectId),
    loadGoals(projectId).catch(() => []),
  ]);
  const thread = ((history || []) as any[]).reverse();
  if (!thread.length || thread[thread.length - 1].author_type !== "client") return null;

  const facts = {
    business: (project as any)?.name, website: (project as any)?.url,
    last30Days: nums.numbers, risingSearches: nums.wins, goals,
  };
  const system = [
    `You draft replies for ${STRATEGIST_NAME}, a real SEO strategist at SEO Season, writing to a small-business client.`,
    "A team member will read and edit your draft before it is sent.",
    "Rules: warm, plain English, no jargon, short (under 120 words). Lead with any genuine good news from the facts.",
    "Use only the facts provided; never invent numbers, rankings or promises. If the facts don't answer the question, say you'll check and suggest a quick call.",
    "Never guarantee rankings or results. Don't mention that you are an AI. Reply with the message text only, signed off as " + STRATEGIST_NAME + ".",
  ].join("\n");
  const convo = thread.map((m) => `${m.author_type === "client" ? "Client" : STRATEGIST_NAME}: ${m.body}`).join("\n\n");

  const { callLLM } = await import("./llm-client.js");
  const r = await callLLM({
    tier: "standard", system, maxTokens: 400, temperature: 0.4,
    messages: [{ role: "user", content: `Facts (JSON):\n${JSON.stringify(facts).slice(0, 6000)}\n\nConversation so far:\n${convo}\n\nDraft the next reply.` }],
    capProjectId: projectId, engine: "client_panel_draft", projectId,
  });
  if (!r.ok || !r.text.trim()) return null;

  /* One live draft per project: older unused drafts are retired. */
  await db().from("client_messages").update({ status: "discarded" })
    .eq("project_id", projectId).eq("author_type", "ai_draft").eq("status", "draft");
  await db().from("client_messages").insert({
    project_id: projectId, author_type: "ai_draft", author_label: "AI draft", body: r.text.trim(), status: "draft",
  });
  return r.text.trim();
}

/* ─── Staff actions ───────────────────────────────────────────── */

async function cpsInbox() {
  const { data, error } = await db().from("client_messages")
    .select("project_id,author_type,author_label,body,status,created_at,read_by_staff_at")
    .neq("status", "discarded").order("created_at", { ascending: false }).limit(1000);
  if (error) return isMissingTable(error) ? { success: true, threads: [], hint: MIGRATION_HINT } : { success: false, error: error.message };
  const byProject: Record<string, any> = {};
  for (const m of (data || []) as any[]) {
    const t = byProject[m.project_id] ||= { projectId: m.project_id, last: null, waiting: false, hasDraft: false, unread: 0 };
    if (m.author_type === "ai_draft") { if (m.status === "draft") t.hasDraft = true; continue; }
    if (!t.last) { t.last = { from: m.author_type, name: m.author_label, body: m.body.slice(0, 160), at: m.created_at }; t.waiting = m.author_type === "client"; }
    if (m.author_type === "client" && !m.read_by_staff_at) t.unread++;
  }
  const threads = Object.values(byProject).filter((t: any) => t.last);
  const ids = threads.map((t: any) => t.projectId);
  if (ids.length) {
    const { data: projects } = await db().from("projects").select("id,name,url").in("id", ids);
    const names: Record<string, any> = {};
    for (const p of (projects || []) as any[]) names[p.id] = p;
    for (const t of threads as any[]) t.project = names[t.projectId] || { id: t.projectId };
  }
  threads.sort((a: any, b: any) => Number(b.waiting) - Number(a.waiting) || String(b.last.at).localeCompare(String(a.last.at)));
  return { success: true, threads, strategist: { name: STRATEGIST_NAME } };
}

async function cpsThread(body: any) {
  const pid = String(body?.projectId || "");
  if (!pid) return { success: false, error: "projectId required" };
  const { data, error } = await db().from("client_messages")
    .select("id,author_type,author_label,staff_email,body,status,created_at")
    .eq("project_id", pid).in("status", ["sent", "draft"])
    .order("created_at", { ascending: true }).limit(500);
  if (error) return { success: false, error: isMissingTable(error) ? MIGRATION_HINT : error.message };
  db().from("client_messages").update({ read_by_staff_at: new Date().toISOString() })
    .eq("project_id", pid).eq("author_type", "client").is("read_by_staff_at", null).then(() => {}, () => {});
  const rows = (data || []) as any[];
  const { data: project } = await db().from("projects").select("id,name,url").eq("id", pid).maybeSingle();
  return {
    success: true, project, strategist: { name: STRATEGIST_NAME },
    messages: rows.filter((m) => m.status === "sent"),
    draft: rows.filter((m) => m.author_type === "ai_draft" && m.status === "draft").pop() || null,
  };
}

async function cpsReply(body: any, staffEmail: string | null) {
  const pid = String(body?.projectId || "");
  const text = String(body?.body || "").trim();
  if (!pid || !text) return { success: false, error: "projectId and a message are required" };
  if (text.length > MAX_MESSAGE) return { success: false, error: `Please keep messages under ${MAX_MESSAGE} characters.` };
  const { data, error } = await db().from("client_messages").insert({
    project_id: pid, author_type: "staff", author_label: STRATEGIST_NAME, staff_email: staffEmail, body: text, status: "sent",
  }).select("id,created_at").single();
  if (error || !data) return { success: false, error: isMissingTable(error) ? MIGRATION_HINT : (error?.message || "Could not send") };
  if (body?.draftId) {
    await db().from("client_messages").update({ status: "used" }).eq("id", body.draftId).eq("project_id", pid);
  }
  /* Let the client's people know there's a reply (best effort). */
  emailProjectClients(pid, `${STRATEGIST_NAME} replied to your message`,
    `${STRATEGIST_NAME} from SEO Season replied:\n\n${text.slice(0, 1200)}`, "/c/talk").catch(() => {});
  return { success: true, message: data };
}

/** Email everyone active on a client project (best effort; needs RESEND_API_KEY). */
export async function emailProjectClients(projectId: string, subject: string, text: string, path: string) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return;
  const { data: users } = await db().from("client_users").select("email").eq("project_id", projectId).eq("active", true);
  const to = ((users || []) as any[]).map((u) => u.email).filter(Boolean);
  if (!to.length) return;
  const site = (process.env.APP_URL || "https://seoseason.com").replace(/\/$/, "");
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.CLIENT_LOGIN_FROM || "SEO Season <noreply@seoseason.com>",
      to, subject,
      text: `${text}\n\nOpen your panel: ${site}${path}`,
    }),
  });
}

async function cpsRedraft(body: any) {
  const pid = String(body?.projectId || "");
  if (!pid) return { success: false, error: "projectId required" };
  const text = await draftReply(pid);
  return text ? { success: true, draft: text } : { success: false, error: "No draft — the last message isn't from the client, or the AI is unavailable." };
}

async function cpsDiscardDraft(body: any) {
  const id = String(body?.draftId || "");
  if (!id) return { success: false, error: "draftId required" };
  const { error } = await db().from("client_messages").update({ status: "discarded" }).eq("id", id).eq("author_type", "ai_draft");
  return error ? { success: false, error: error.message } : { success: true };
}

/* ─── Router ──────────────────────────────────────────────────── */

export const CLIENT_PANEL_PUBLIC_ACTIONS = [
  "cp_home", "cp_goals", "cp_reports", "cp_settings_update", "cp_messages_list", "cp_message_send",
];

export async function handleClientPanel(action: string, body: any, staffEmail: string | null): Promise<any | null> {
  switch (action) {
    case "cp_home":             return cpHome(body);
    case "cp_goals":            return cpGoals(body);
    case "cp_reports":          return cpReports(body);
    case "cp_settings_update":  return cpSettingsUpdate(body);
    case "cp_messages_list":    return cpMessagesList(body);
    case "cp_message_send":     return cpMessageSend(body);
    case "cps_inbox":           return cpsInbox();
    case "cps_thread":          return cpsThread(body);
    case "cps_reply":           return cpsReply(body, staffEmail);
    case "cps_redraft":         return cpsRedraft(body);
    case "cps_discard_draft":   return cpsDiscardDraft(body);
    default: return null;
  }
}
