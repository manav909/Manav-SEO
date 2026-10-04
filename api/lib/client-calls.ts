/* ════════════════════════════════════════════════════════════════
   api/lib/client-calls.ts
   Book a call · Calls & notes · tracked actions.

   • The team sets weekly hours once (call_settings, in the team's own
     time zone) plus a standing meeting link (Google Meet, Zoom …).
   • Clients see free slots for the next couple of weeks and book one.
     Both sides get an email with a calendar invite (.ics) attached, so
     it lands in Google Calendar, Outlook or Apple Calendar alike.
   • After the call the team pastes the transcript; AI drafts a plain-
     English summary and the actions agreed. A person edits and sends
     them — the client then sees the notes and a checklist of actions
     (team's and theirs) that stays tracked until done.

   Tables: supabase-migrations/calls.sql
═══════════════════════════════════════════════════════════════ */

import { db } from "./db.js";
import { withClientSession } from "./brand-studio-client.js";
import { getPanelPlan } from "./panel-plans.js";
import { createNotification } from "./brand-studio-collab.js";

const MIGRATION_HINT = "Call booking isn't set up yet. Run supabase-migrations/calls.sql in the Supabase SQL editor.";
const DEFAULTS = {
  host_name: process.env.STRATEGIST_NAME || "Manvisha", host_email: null as string | null,
  timezone: "America/Chicago", slot_minutes: 20, notice_hours: 12, horizon_days: 14, meeting_link: null as string | null,
  weekly_hours: [{ weekday: 2, start: "10:00", end: "12:00" }, { weekday: 4, start: "16:00", end: "18:00" }],
};

function isMissingTable(err: any): boolean {
  const m = String(err?.message || "");
  return err?.code === "42P01" || err?.code === "PGRST205" || /(call_settings|client_calls|call_actions)/.test(m) && /does not exist|schema cache/.test(m);
}
const fail = (err: any) => ({ success: false, error: isMissingTable(err) ? MIGRATION_HINT : (err?.message || "Something went wrong") });

/* ─── Time zones without a library ────────────────────────────── */

/** Offset (ms) of `tz` from UTC at instant `t`. */
function tzOffset(t: number, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(t));
  const get = (k: string) => Number(parts.find((p) => p.type === k)?.value);
  return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second")) - Math.floor(t / 1000) * 1000;
}

/** Wall-clock time in `tz` → UTC instant (handles daylight saving). */
export function zonedToUtc(y: number, mo: number, d: number, h: number, mi: number, tz: string): number {
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  let t = guess - tzOffset(guess, tz);
  t = guess - tzOffset(t, tz);
  return t;
}

/** Calendar date + weekday of instant `t` in `tz`. */
function zonedDate(t: number, tz: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" }).formatToParts(new Date(t));
  const get = (k: string) => parts.find((p) => p.type === k)?.value || "";
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  return { y: Number(get("year")), m: Number(get("month")), d: Number(get("day")), weekday: wd };
}

export async function getSettings() {
  const { data, error } = await db().from("call_settings").select("*").eq("id", 1).maybeSingle();
  if (error && isMissingTable(error)) return { ...DEFAULTS, missing: true };
  return { ...DEFAULTS, ...(data || {}), missing: false };
}

/** Free slots (UTC ISO strings) between now+notice and now+horizon. */
export async function freeSlots(now = Date.now()) {
  const s = await getSettings();
  const tz = s.timezone;
  const from = now + (s.notice_hours || 0) * 3600_000;
  const until = now + (s.horizon_days || 14) * 86400_000;
  const step = Math.max(10, Number(s.slot_minutes) || 20) * 60_000;
  const hours = Array.isArray(s.weekly_hours) ? s.weekly_hours : [];
  const slots: number[] = [];
  for (let day = 0; day <= (s.horizon_days || 14) + 1; day++) {
    const { y, m, d, weekday } = zonedDate(now + day * 86400_000, tz);
    for (const w of hours.filter((h: any) => Number(h.weekday) === weekday)) {
      const [sh, sm] = String(w.start).split(":").map(Number);
      const [eh, em] = String(w.end).split(":").map(Number);
      const start = zonedToUtc(y, m, d, sh, sm, tz);
      const end = zonedToUtc(y, m, d, eh, em, tz);
      for (let t = start; t + step <= end; t += step) if (t >= from && t <= until) slots.push(t);
    }
  }
  const uniq = [...new Set(slots)].sort((a, b) => a - b);
  if (!uniq.length) return { slots: [], settings: s };
  const { data: booked } = await db().from("client_calls").select("starts_at")
    .eq("status", "booked").gte("starts_at", new Date(uniq[0]).toISOString()).lte("starts_at", new Date(uniq[uniq.length - 1]).toISOString());
  const taken = new Set(((booked || []) as any[]).map((b) => new Date(b.starts_at).getTime()));
  return { slots: uniq.filter((t) => !taken.has(t)).map((t) => new Date(t).toISOString()), settings: s };
}

/* ─── Email + calendar invite ─────────────────────────────────── */

function icsDate(t: number) { return new Date(t).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""); }
function icsEscape(s: string) { return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n"); }

export function buildIcs(o: { id: string; start: number; minutes: number; title: string; description: string; link?: string | null; organizer?: string | null; cancel?: boolean }) {
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//SEO Season//Calls//EN", `METHOD:${o.cancel ? "CANCEL" : "REQUEST"}`,
    "BEGIN:VEVENT", `UID:${o.id}@seoseason`, `DTSTAMP:${icsDate(Date.now())}`,
    `DTSTART:${icsDate(o.start)}`, `DTEND:${icsDate(o.start + o.minutes * 60_000)}`,
    `SUMMARY:${icsEscape(o.title)}`, `DESCRIPTION:${icsEscape(o.description + (o.link ? `\n\nJoin: ${o.link}` : ""))}`,
    o.link ? `LOCATION:${icsEscape(o.link)}` : "", o.organizer ? `ORGANIZER:mailto:${o.organizer}` : "",
    `STATUS:${o.cancel ? "CANCELLED" : "CONFIRMED"}`, "END:VEVENT", "END:VCALENDAR",
  ].filter(Boolean).join("\r\n");
}

async function sendMail(to: string[], subject: string, text: string, ics?: string) {
  const key = process.env.RESEND_API_KEY;
  if (!key || !to.length) return;
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.CLIENT_LOGIN_FROM || "SEO Season <noreply@seoseason.com>", to, subject, text,
      attachments: ics ? [{ filename: "invite.ics", content: Buffer.from(ics).toString("base64") }] : undefined,
    }),
  }).catch(() => {});
}

function whenText(t: number, tz: string) {
  return new Date(t).toLocaleString("en-US", { timeZone: tz, weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" });
}

/* ─── Client ──────────────────────────────────────────────────── */

async function clientCtx(body: any): Promise<{ user: any } | { result: any }> {
  const { user, error } = await withClientSession(body);
  if (!user) return { result: { success: false, error: error || "Please sign in again.", code: "session" } };
  const panel = await getPanelPlan(user.project_id);
  if (!panel.features.calls) return { result: { success: false, error: "This isn't part of your plan yet.", code: "not_in_plan" } };
  return { user };
}

async function cpCallSlots(body: any) {
  const c = await clientCtx(body);
  if ("result" in c) return c.result;
  const { slots, settings } = await freeSlots();
  if ((settings as any).missing) return { success: false, error: MIGRATION_HINT };
  return { success: true, slots, minutes: settings.slot_minutes, host: settings.host_name, teamTimezone: settings.timezone };
}

async function cpCallBook(body: any) {
  const c = await clientCtx(body);
  if ("result" in c) return c.result;
  const startsAt = new Date(String(body?.startsAt || "")).getTime();
  if (!Number.isFinite(startsAt)) return { success: false, error: "Please pick a time." };
  const { slots, settings } = await freeSlots();
  if (!slots.includes(new Date(startsAt).toISOString())) return { success: false, error: "That time was just taken — please pick another." };
  const topic = String(body?.topic || "").trim().slice(0, 300) || "Catch-up";

  const { data, error } = await db().from("client_calls").insert({
    project_id: c.user.project_id, client_user_id: c.user.id, starts_at: new Date(startsAt).toISOString(),
    minutes: settings.slot_minutes, topic, status: "booked", meeting_link: settings.meeting_link,
  }).select("id").single();
  if (error || !data) {
    if (String(error?.code) === "23505") return { success: false, error: "That time was just taken — please pick another." };
    return fail(error);
  }
  const id = (data as any).id;
  const { data: project } = await db().from("projects").select("name").eq("id", c.user.project_id).maybeSingle();
  const title = `SEO Season call: ${(project as any)?.name || "your website"} — ${topic}`;
  const ics = buildIcs({ id, start: startsAt, minutes: settings.slot_minutes, title, description: `Call with ${settings.host_name} about: ${topic}`, link: settings.meeting_link, organizer: settings.host_email });
  await sendMail([c.user.email], `Booked: ${whenText(startsAt, settings.timezone)}`,
    `Your call with ${settings.host_name} is booked for ${whenText(startsAt, settings.timezone)}.\nTopic: ${topic}\n${settings.meeting_link ? `Join: ${settings.meeting_link}\n` : ""}\nThe calendar invite is attached.`, ics);
  if (settings.host_email) {
    await sendMail([settings.host_email], `New call booked — ${(project as any)?.name || "client"}`,
      `${c.user.display_name || c.user.email} booked ${whenText(startsAt, settings.timezone)}.\nTopic: ${topic}`, ics);
  }
  await createNotification({ projectId: c.user.project_id, recipientType: "staff", recipientId: `pm:${c.user.project_id}`, kind: "call_booked", title: `Call booked: ${whenText(startsAt, settings.timezone)}`, body: topic });
  return { success: true, call: { id, startsAt: new Date(startsAt).toISOString(), minutes: settings.slot_minutes, topic, meetingLink: settings.meeting_link, ics } };
}

async function cpCalls(body: any) {
  const c = await clientCtx(body);
  if ("result" in c) return c.result;
  const pid = c.user.project_id;
  const [calls, actions] = await Promise.all([
    db().from("client_calls").select("id,starts_at,minutes,topic,status,meeting_link,summary,summary_sent_at")
      .eq("project_id", pid).neq("status", "cancelled").order("starts_at", { ascending: false }).limit(50),
    db().from("call_actions").select("id,call_id,what,owner,due_date,status,done_at")
      .eq("project_id", pid).order("created_at", { ascending: true }).limit(300),
  ]);
  if (calls.error) return fail(calls.error);
  const now = Date.now();
  const rows = (calls.data || []) as any[];
  return {
    success: true,
    upcoming: rows.filter((r) => r.status === "booked" && new Date(r.starts_at).getTime() + r.minutes * 60_000 > now).reverse(),
    /* Only notes the team has checked and sent are shown. */
    past: rows.filter((r) => r.status === "done" && r.summary_sent_at).map((r) => ({ ...r, actions: ((actions.data || []) as any[]).filter((a) => a.call_id === r.id) })),
    openActions: ((actions.data || []) as any[]).filter((a) => a.status === "open"),
  };
}

async function cpCallCancel(body: any) {
  const c = await clientCtx(body);
  if ("result" in c) return c.result;
  const { data, error } = await db().from("client_calls").update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", String(body?.callId || "")).eq("project_id", c.user.project_id).eq("status", "booked").select("id,starts_at,minutes,topic");
  if (error) return fail(error);
  if (!data || !(data as any[]).length) return { success: false, error: "That call can't be cancelled." };
  const call = (data as any[])[0];
  const s = await getSettings();
  const ics = buildIcs({ id: call.id, start: new Date(call.starts_at).getTime(), minutes: call.minutes, title: `SEO Season call — ${call.topic}`, description: "Cancelled", cancel: true });
  await sendMail([c.user.email, ...(s.host_email ? [s.host_email] : [])], `Cancelled: call on ${whenText(new Date(call.starts_at).getTime(), s.timezone)}`, "This call has been cancelled. You can book another time from your panel.", ics);
  await createNotification({ projectId: c.user.project_id, recipientType: "staff", recipientId: `pm:${c.user.project_id}`, kind: "call_cancelled", title: `Call cancelled: ${whenText(new Date(call.starts_at).getTime(), s.timezone)}` });
  return { success: true };
}

async function cpActionDone(body: any) {
  const c = await clientCtx(body);
  if ("result" in c) return c.result;
  const done = body?.done !== false;
  const { data, error } = await db().from("call_actions").update({ status: done ? "done" : "open", done_at: done ? new Date().toISOString() : null })
    .eq("id", String(body?.actionId || "")).eq("project_id", c.user.project_id).eq("owner", "client").select("id");
  if (error) return fail(error);
  return data && (data as any[]).length ? { success: true } : { success: false, error: "Only your own actions can be ticked off here." };
}

/* ─── Team ────────────────────────────────────────────────────── */

async function cpsCallSettingsSave(body: any) {
  const s = body?.settings || {};
  const hours = (Array.isArray(s.weekly_hours) ? s.weekly_hours : [])
    .filter((h: any) => Number.isInteger(Number(h.weekday)) && /^\d{2}:\d{2}$/.test(h.start) && /^\d{2}:\d{2}$/.test(h.end) && h.start < h.end)
    .map((h: any) => ({ weekday: Number(h.weekday), start: h.start, end: h.end })).slice(0, 30);
  try { new Intl.DateTimeFormat("en-US", { timeZone: String(s.timezone || DEFAULTS.timezone) }); }
  catch { return { success: false, error: "Unknown time zone" }; }
  const row: any = {
    id: 1, host_name: String(s.host_name || DEFAULTS.host_name).slice(0, 120),
    host_email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s.host_email || "")) ? s.host_email : null,
    timezone: String(s.timezone || DEFAULTS.timezone),
    slot_minutes: Math.min(120, Math.max(10, Math.round(Number(s.slot_minutes) || 20))),
    notice_hours: Math.min(168, Math.max(0, Math.round(Number(s.notice_hours) || 0))),
    horizon_days: Math.min(60, Math.max(1, Math.round(Number(s.horizon_days) || 14))),
    meeting_link: /^https:\/\//i.test(String(s.meeting_link || "")) ? String(s.meeting_link).slice(0, 500) : null,
    weekly_hours: hours, updated_at: new Date().toISOString(),
  };
  const { error } = await db().from("call_settings").upsert(row, { onConflict: "id" });
  return error ? fail(error) : { success: true, settings: row };
}

async function cpsCallsList() {
  const since = new Date(Date.now() - 30 * 86400_000).toISOString();
  const { data, error } = await db().from("client_calls").select("*").gte("starts_at", since).neq("status", "cancelled").order("starts_at", { ascending: true }).limit(200);
  if (error) return fail(error);
  const rows = (data || []) as any[];
  const ids = [...new Set(rows.map((r) => r.project_id))];
  const names: Record<string, any> = {};
  if (ids.length) for (const p of ((await db().from("projects").select("id,name,url").in("id", ids)).data || []) as any[]) names[p.id] = p;
  return { success: true, calls: rows.map((r) => ({ ...r, project: names[r.project_id] || { id: r.project_id } })), settings: await getSettings() };
}

/** Prep for a call: the client's latest messages, wins, open orders and open actions. */
async function cpsCallPrep(body: any) {
  const pid = String(body?.projectId || "");
  if (!pid) return { success: false, error: "projectId required" };
  const safe = async (p: PromiseLike<any>) => { try { const r = await p; return r.error ? [] : (r.data || []); } catch { return []; } };
  const [messages, wins, orders, actions] = await Promise.all([
    safe(db().from("client_messages").select("author_type,body,created_at").eq("project_id", pid).eq("status", "sent").order("created_at", { ascending: false }).limit(5)),
    safe(db().from("client_wins").select("title,happened_at").eq("project_id", pid).order("happened_at", { ascending: false }).limit(5)),
    safe(db().from("client_orders").select("name,status,due_date").eq("project_id", pid).neq("status", "delivered").neq("status", "cancelled").limit(10)),
    safe(db().from("call_actions").select("what,owner,due_date").eq("project_id", pid).eq("status", "open").limit(20)),
  ]);
  return { success: true, messages, wins, orders, actions };
}

async function cpsCallTranscript(body: any) {
  const id = String(body?.callId || "");
  const transcript = String(body?.transcript || "").trim();
  if (!id || transcript.length < 20) return { success: false, error: "Paste the transcript (or your notes) first." };
  const { data: call, error } = await db().from("client_calls").select("id,project_id,topic,starts_at").eq("id", id).maybeSingle();
  if (error) return fail(error);
  if (!call) return { success: false, error: "Call not found" };
  await db().from("client_calls").update({ transcript: transcript.slice(0, 200_000), updated_at: new Date().toISOString() }).eq("id", id);

  const { callLLM } = await import("./llm-client.js");
  const r = await callLLM({
    tier: "standard", maxTokens: 900, temperature: 0.2,
    system: [
      "You turn an SEO strategy call transcript into notes for a small-business client.",
      "Return JSON only: {\"summary\": string, \"actions\": [{\"what\": string, \"owner\": \"team\"|\"client\", \"due_in_days\": number|null}]}.",
      "Summary: under 120 words, plain English, start with what went well, then what was agreed. No jargon, no promises of rankings.",
      "Actions: only things actually agreed in the call, each short and concrete. Use owner \"client\" only when the client said they'd do it.",
    ].join("\n"),
    messages: [{ role: "user", content: `Call topic: ${(call as any).topic || "catch-up"}\n\nTranscript:\n${transcript.slice(0, 60_000)}` }],
    capProjectId: (call as any).project_id, engine: "call_summary", projectId: (call as any).project_id,
  });
  if (!r.ok) return { success: false, error: "The AI couldn't draft notes right now — write them by hand or try again." };
  let parsed: any = null;
  try { parsed = JSON.parse((r.text.match(/\{[\s\S]*\}/) || [""])[0]); } catch { parsed = null; }
  const summary = String(parsed?.summary || r.text).trim().slice(0, 4000);
  const actions = (Array.isArray(parsed?.actions) ? parsed.actions : []).slice(0, 15).map((a: any) => ({
    what: String(a?.what || "").trim().slice(0, 300), owner: a?.owner === "client" ? "client" : "team",
    due_date: Number.isFinite(Number(a?.due_in_days)) && Number(a.due_in_days) > 0 ? new Date(Date.now() + Number(a.due_in_days) * 86400_000).toISOString().slice(0, 10) : null,
  })).filter((a: any) => a.what);
  await db().from("client_calls").update({ summary_draft: summary }).eq("id", id);
  return { success: true, summary, actions };
}

async function cpsCallSendSummary(body: any) {
  const id = String(body?.callId || "");
  const summary = String(body?.summary || "").trim();
  if (!id || !summary) return { success: false, error: "A summary is required." };
  const { data: call, error } = await db().from("client_calls").select("id,project_id,starts_at,topic,summary_sent_at").eq("id", id).maybeSingle();
  if (error) return fail(error);
  if (!call) return { success: false, error: "Call not found" };
  const c = call as any;
  const now = new Date().toISOString();
  await db().from("client_calls").update({ summary: summary.slice(0, 6000), status: "done", summary_sent_at: now, updated_at: now }).eq("id", id);
  const rows = (Array.isArray(body?.actions) ? body.actions : []).slice(0, 20)
    .map((a: any) => ({
      call_id: id, project_id: c.project_id, what: String(a?.what || "").trim().slice(0, 300),
      owner: a?.owner === "client" ? "client" : "team",
      due_date: /^\d{4}-\d{2}-\d{2}$/.test(String(a?.due_date || "")) ? a.due_date : null,
    })).filter((a: any) => a.what);
  if (!c.summary_sent_at && rows.length) await db().from("call_actions").insert(rows);
  const { emailProjectClients } = await import("./client-panel.js");
  const s = await getSettings();
  emailProjectClients(c.project_id, "Notes from your call", `Here's what we talked about and agreed:\n\n${summary}${rows.length ? `\n\nNext steps:\n${rows.map((a: any) => `• ${a.what} (${a.owner === "client" ? "you" : s.host_name})`).join("\n")}` : ""}`, "/c/calls").catch(() => {});
  return { success: true, actions: rows.length };
}

async function cpsActionUpdate(body: any) {
  const done = body?.done !== false;
  const { error } = await db().from("call_actions").update({ status: done ? "done" : "open", done_at: done ? new Date().toISOString() : null }).eq("id", String(body?.actionId || ""));
  return error ? fail(error) : { success: true };
}

/* ─── Router ──────────────────────────────────────────────────── */

export async function handleClientCalls(action: string, body: any): Promise<any | null> {
  switch (action) {
    case "cp_call_slots":          return cpCallSlots(body);
    case "cp_call_book":           return cpCallBook(body);
    case "cp_calls":               return cpCalls(body);
    case "cp_call_cancel":         return cpCallCancel(body);
    case "cp_action_done":         return cpActionDone(body);
    case "cps_call_settings_get":  return { success: true, settings: await getSettings() };
    case "cps_call_settings_save": return cpsCallSettingsSave(body);
    case "cps_calls_list":         return cpsCallsList();
    case "cps_call_prep":          return cpsCallPrep(body);
    case "cps_call_transcript":    return cpsCallTranscript(body);
    case "cps_call_send_summary":  return cpsCallSendSummary(body);
    case "cps_action_update":      return cpsActionUpdate(body);
    default: return null;
  }
}
