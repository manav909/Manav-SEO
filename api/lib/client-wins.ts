/* ════════════════════════════════════════════════════════════════
   api/lib/client-wins.ts
   Proof & delight.

   • Nightly (clientWinsCronTick, after the Google pulls) for every
     project with its client portal on:
       – saves today's position for its top searches (keyword_history),
         so clients can see a real trend instead of a single number;
       – records wins worth celebrating (client_wins), each once:
         reaching page 1 for a search, a best-ever month of visits from
         Google, a goal reached. Delivered orders add a win too.
   • Clients see their wins on Home and can thank the team.
   • The team's "My day" gathers what needs a person today: waiting
     messages, offers to review, orders due, plus thanks and wins.

   Every win comes from measured data — nothing is estimated.
   Tables: supabase-migrations/client_wins.sql
═══════════════════════════════════════════════════════════════ */

import { db } from "./db.js";
import { withClientSession } from "./brand-studio-client.js";
import { getPanelPlan } from "./panel-plans.js";
import { createNotification } from "./brand-studio-collab.js";
import { loadNumbers, loadGoals } from "./client-panel.js";

const today = () => new Date().toISOString().slice(0, 10);
const month = () => new Date().toISOString().slice(0, 7);

/* ─── Recording ───────────────────────────────────────────────── */

export async function recordWin(projectId: string, w: { kind: string; title: string; detail?: string; key: string; by?: string }): Promise<boolean> {
  const { data, error } = await db().from("client_wins").upsert({
    project_id: projectId, kind: w.kind, title: w.title.slice(0, 300), detail: w.detail?.slice(0, 1000) || null,
    dedupe_key: w.key, created_by: w.by || "system",
  }, { onConflict: "project_id,dedupe_key", ignoreDuplicates: true }).select("id");
  return !error && Array.isArray(data) && data.length > 0;
}

async function snapshotKeywords(projectId: string): Promise<number> {
  const { data } = await db().from("project_knowledge").select("field_value")
    .eq("project_id", projectId).eq("category", "analytics").eq("field_key", "gsc_top_queries").maybeSingle();
  let rows: any[] = [];
  try { rows = JSON.parse(String((data as any)?.field_value || "[]")); } catch { rows = []; }
  const day = today();
  const out = (Array.isArray(rows) ? rows : [])
    .filter((r) => r?.query && Number.isFinite(Number(r.position)))
    .slice(0, 50)
    .map((r) => ({
      project_id: projectId, query: String(r.query).slice(0, 300), day,
      position: Math.round(Number(r.position) * 10) / 10,
      clicks: Math.round(Number(r.clicks) || 0), impressions: Math.round(Number(r.impressions) || 0),
    }));
  if (!out.length) return 0;
  const { error } = await db().from("keyword_history").upsert(out, { onConflict: "project_id,query,day" });
  return error ? 0 : out.length;
}

export async function detectWins(projectId: string): Promise<{ keywords: number; newWins: string[] }> {
  const newWins: string[] = [];
  const keywords = await snapshotKeywords(projectId).catch(() => 0);
  const [{ numbers, wins: rising }, goals] = await Promise.all([loadNumbers(projectId), loadGoals(projectId).catch(() => [])]);

  /* Reached page 1 for a search (from measured position change). */
  for (const s of rising.filter((r) => r.kind === "page_2_to_1").slice(0, 5)) {
    if (await recordWin(projectId, {
      kind: "page_one", key: `page_one:${s.query.toLowerCase()}`,
      title: `Page 1 of Google for “${s.query}”`,
      detail: `Now around position ${Math.round(s.position)}.`,
    })) newWins.push(`page_one:${s.query}`);
  }

  /* Best month of visits from Google since we started measuring. */
  const ch = numbers?.change?.clicks;
  if (numbers?.clicks && ch && ch.direction === "up" && ch.pct >= 0.05) {
    const { data: prev } = await db().from("client_wins").select("detail")
      .eq("project_id", projectId).eq("kind", "clicks_record").order("happened_at", { ascending: false }).limit(1);
    const lastRecord = Number(String((prev as any[])?.[0]?.detail || "").match(/^(\d+)/)?.[1] || 0);
    if (numbers.clicks > lastRecord && numbers.clicks > (ch.from || 0)) {
      if (await recordWin(projectId, {
        kind: "clicks_record", key: `clicks_record:${month()}`,
        title: `${Math.round(numbers.clicks).toLocaleString("en-US")} visits from Google in 30 days — up ${Math.round(ch.pct * 100)}%`,
        detail: `${Math.round(numbers.clicks)} visits in the last 30 days, compared with ${Math.round(ch.from)} the 30 days before.`,
      })) newWins.push("clicks_record");
    }
  }

  /* Goals reached. */
  for (const g of goals as any[]) {
    if (g.current == null || g.target == null) continue;
    const reached = g.metric === "avg_position" ? g.current <= g.target : g.current >= g.target;
    if (reached && await recordWin(projectId, { kind: "goal_reached", key: `goal:${g.id}`, title: `Goal reached: ${g.name}` })) newWins.push(`goal:${g.id}`);
  }

  if (newWins.length) {
    await createNotification({
      projectId, recipientType: "staff", recipientId: `pm:${projectId}`, kind: "client_wins",
      title: `${newWins.length} new win${newWins.length > 1 ? "s" : ""} to celebrate with the client`,
    });
  }
  return { keywords, newWins };
}

/** Nightly: every project whose client portal is switched on. */
export async function clientWinsCronTick() {
  const { data } = await db().from("project_entitlements").select("project_id").eq("client_portal_enabled", true).limit(500);
  const ids = ((data || []) as any[]).map((r) => r.project_id);
  let keywords = 0, wins = 0, errors = 0;
  for (const id of ids) {
    try { const r = await detectWins(id); keywords += r.keywords; wins += r.newWins.length; }
    catch { errors++; }
  }
  return { projects: ids.length, keywords, wins, errors };
}

/* ─── Client ──────────────────────────────────────────────────── */

async function clientUser(body: any, feature?: string): Promise<{ user: any } | { result: any }> {
  const { user, error } = await withClientSession(body);
  if (!user) return { result: { success: false, error: error || "Please sign in again.", code: "session" } };
  if (feature) {
    const panel = await getPanelPlan(user.project_id);
    if (!panel.features[feature]) return { result: { success: false, error: "This isn't part of your plan yet.", code: "not_in_plan" } };
  }
  return { user };
}

export async function listWins(projectId: string, limit = 30) {
  const { data, error } = await db().from("client_wins")
    .select("id,kind,title,detail,happened_at,thanks,thanked_at")
    .eq("project_id", projectId).order("happened_at", { ascending: false }).limit(limit);
  return error ? [] : (data || []);
}

async function cpWins(body: any) {
  const c = await clientUser(body, "goals");
  if ("result" in c) return c.result;
  return { success: true, wins: await listWins(c.user.project_id, 50) };
}

async function cpWinThanks(body: any) {
  const c = await clientUser(body);
  if ("result" in c) return c.result;
  const message = String(body?.message || "").trim().slice(0, 500) || "Thank you!";
  const { data, error } = await db().from("client_wins").update({ thanks: message, thanked_at: new Date().toISOString() })
    .eq("id", String(body?.winId || "")).eq("project_id", c.user.project_id).is("thanked_at", null).select("title");
  if (error) return { success: false, error: error.message };
  if (!data || !(data as any[]).length) return { success: false, error: "Already thanked — your team got it!" };
  await createNotification({
    projectId: c.user.project_id, recipientType: "staff", recipientId: `pm:${c.user.project_id}`, kind: "win_thanks",
    title: `${c.user.display_name || "Your client"} said thanks: ${(data as any[])[0].title}`, body: message,
  });
  return { success: true };
}

async function cpKeywords(body: any) {
  const c = await clientUser(body, "keywords");
  if ("result" in c) return c.result;
  const since = new Date(Date.now() - 90 * 86400_000).toISOString().slice(0, 10);
  const { data, error } = await db().from("keyword_history").select("query,day,position,clicks,impressions")
    .eq("project_id", c.user.project_id).gte("day", since).order("day", { ascending: true }).limit(5000);
  if (error) return { success: true, keywords: [] };
  const byQuery: Record<string, any[]> = {};
  for (const r of (data || []) as any[]) (byQuery[r.query] ||= []).push(r);
  const keywords = Object.entries(byQuery).map(([query, rows]) => {
    const last = rows[rows.length - 1];
    const monthAgo = rows.find((r) => r.day >= new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10)) || rows[0];
    return {
      query, position: Number(last.position), clicks: last.clicks, impressions: last.impressions,
      change: monthAgo && monthAgo !== last ? Math.round((Number(monthAgo.position) - Number(last.position)) * 10) / 10 : null,
      series: rows.map((r) => ({ day: r.day, position: Number(r.position) })),
      since: rows[0].day,
    };
  }).sort((a, b) => (b.clicks || 0) - (a.clicks || 0) || a.position - b.position);
  return { success: true, keywords };
}

/* ─── Team ────────────────────────────────────────────────────── */

async function cpsMyDay() {
  const now = Date.now();
  const soon = new Date(now + 3 * 86400_000).toISOString().slice(0, 10);
  const twoWeeks = new Date(now - 14 * 86400_000).toISOString();
  const safe = async <T,>(p: PromiseLike<{ data: T | null; error: any }>): Promise<T | []> => {
    try { const r = await p; return (r.error ? [] : (r.data || [])) as T; } catch { return []; }
  };
  const [messages, offers, orders, orderThanks, wins] = await Promise.all([
    safe(db().from("client_messages").select("project_id,author_type,author_label,body,created_at").in("author_type", ["client", "staff"]).eq("status", "sent").order("created_at", { ascending: false }).limit(400)),
    safe(db().from("client_offers").select("id,project_id,total_cents,created_at").eq("status", "requested").order("created_at", { ascending: true }).limit(50)),
    safe(db().from("client_orders").select("id,project_id,name,status,due_date,assignee").in("status", ["awaiting_payment", "payment_received", "started", "in_progress"]).order("due_date", { ascending: true }).limit(100)),
    safe(db().from("client_orders").select("id,project_id,name,assignee,thanks,thanks_at").not("thanks_at", "is", null).gte("thanks_at", twoWeeks).order("thanks_at", { ascending: false }).limit(20)),
    safe(db().from("client_wins").select("id,project_id,title,happened_at,thanks,thanked_at").gte("happened_at", twoWeeks).order("happened_at", { ascending: false }).limit(30)),
  ]);

  /* Threads whose latest message is from the client are waiting for a reply. */
  const latest: Record<string, any> = {};
  for (const m of messages as any[]) if (!latest[m.project_id]) latest[m.project_id] = m;
  const waiting = Object.values(latest).filter((m: any) => m.author_type === "client");

  const ordersDue = (orders as any[]).filter((o) => o.status !== "awaiting_payment" && o.due_date && o.due_date <= soon);
  const awaitingPayment = (orders as any[]).filter((o) => o.status === "awaiting_payment");

  const ids = [...new Set([...waiting, ...(offers as any[]), ...(orders as any[]), ...(orderThanks as any[]), ...(wins as any[])].map((x: any) => x.project_id))];
  const names: Record<string, string> = {};
  if (ids.length) {
    const { data } = await db().from("projects").select("id,name").in("id", ids);
    for (const p of (data || []) as any[]) names[p.id] = p.name;
  }
  const withName = (x: any) => ({ ...x, projectName: names[x.project_id] || "Client" });

  const kind = [
    ...(orderThanks as any[]).map((t) => ({ projectName: names[t.project_id] || "Client", text: t.thanks, about: t.name, at: t.thanks_at, who: t.assignee })),
    ...(wins as any[]).filter((w) => w.thanks).map((w) => ({ projectName: names[w.project_id] || "Client", text: w.thanks, about: w.title, at: w.thanked_at })),
  ].sort((a, b) => String(b.at).localeCompare(String(a.at)));

  return {
    success: true,
    todo: {
      replies: waiting.map(withName),
      offers: (offers as any[]).map(withName),
      ordersDue: ordersDue.map(withName),
      awaitingPayment: awaitingPayment.map(withName),
    },
    kindWords: kind.slice(0, 10),
    wins: (wins as any[]).map(withName).slice(0, 10),
  };
}

async function cpsDetectWins(body: any) {
  const pid = String(body?.projectId || "");
  if (pid) return { success: true, ...(await detectWins(pid)) };
  return { success: true, ...(await clientWinsCronTick()) };
}

async function cpsAddWin(body: any, staffEmail: string | null) {
  const pid = String(body?.projectId || "");
  const title = String(body?.title || "").trim();
  if (!pid || !title) return { success: false, error: "projectId and a title are required" };
  const ok = await recordWin(pid, { kind: "custom", title, detail: String(body?.detail || "").trim() || undefined, key: `custom:${Date.now()}`, by: staffEmail || "team" });
  return ok ? { success: true } : { success: false, error: "Could not save the win. Run supabase-migrations/client_wins.sql if you haven't yet." };
}

/* ─── Router ──────────────────────────────────────────────────── */

export async function handleClientWins(action: string, body: any, staffEmail: string | null): Promise<any | null> {
  switch (action) {
    case "cp_wins":          return cpWins(body);
    case "cp_win_thanks":    return cpWinThanks(body);
    case "cp_keywords":      return cpKeywords(body);
    case "cps_my_day":       return cpsMyDay();
    case "cps_detect_wins":  return cpsDetectWins(body);
    case "cps_add_win":      return cpsAddWin(body, staffEmail);
    default: return null;
  }
}
