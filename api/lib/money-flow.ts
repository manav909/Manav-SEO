/* ════════════════════════════════════════════════════════════════
   api/lib/money-flow.ts
   Price list → basket → offer → order.

   1. The client picks improvements from the price list into a basket
      and asks for an offer (cp_offer_request). Prices always come from
      the price list on the server, never from the browser.
   2. The team confirms the offer as-is or changes prices, dates or
      deliverables, with a note (cps_offer_confirm).
   3. The client accepts or declines (cp_offer_decide). Accepting turns
      each line into an order.
   4. Payment happens on another platform, so the team moves each order
      through its steps by hand (cps_order_update): awaiting payment →
      payment received → started → in progress → delivered. Every change
      is kept in the order's history and the client is emailed.
   5. When an order is delivered the client can say thanks.

   Tables: supabase-migrations/money_flow.sql
═══════════════════════════════════════════════════════════════ */

import { db } from "./db.js";
import { withClientSession } from "./brand-studio-client.js";
import { getPanelPlan } from "./panel-plans.js";
import { createNotification } from "./brand-studio-collab.js";
import { emailProjectClients } from "./client-panel.js";

const MIGRATION_HINT = "The price list isn't set up yet. Run supabase-migrations/money_flow.sql in the Supabase SQL editor.";
const MAX_LINES = 20;

export const ORDER_STEPS = ["awaiting_payment", "payment_received", "started", "in_progress", "delivered"] as const;
const ORDER_STATUSES = new Set<string>([...ORDER_STEPS, "cancelled"]);
const STEP_LABEL: Record<string, string> = {
  awaiting_payment: "Waiting for payment", payment_received: "Payment received", started: "Started",
  in_progress: "In progress", delivered: "Delivered", cancelled: "Cancelled",
};

const money = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: cents % 100 ? 2 : 0 })}`;

function isMissingTable(err: any): boolean {
  const m = String(err?.message || "");
  return err?.code === "42P01" || err?.code === "PGRST205" || /(service_catalog|client_offers|client_orders)/.test(m) && /does not exist|schema cache/.test(m);
}
const fail = (err: any) => ({ success: false, error: isMissingTable(err) ? MIGRATION_HINT : (err?.message || "Something went wrong") });

/** Client session + "improvements" plan switch. */
async function clientCtx(body: any): Promise<{ user: any } | { result: any }> {
  const { user, error } = await withClientSession(body);
  if (!user) return { result: { success: false, error: error || "Please sign in again.", code: "session" } };
  const panel = await getPanelPlan(user.project_id);
  if (!panel.features.improvements) return { result: { success: false, error: "This isn't part of your plan yet.", code: "not_in_plan" } };
  return { user };
}

function cleanText(v: unknown, max: number): string | null {
  const t = String(v ?? "").trim();
  return t ? t.slice(0, max) : null;
}

function cleanDeliverables(v: unknown): string[] {
  return (Array.isArray(v) ? v : []).map((d) => String(d ?? "").trim().slice(0, 300)).filter(Boolean).slice(0, 15);
}

function addDays(days: number): string {
  return new Date(Date.now() + days * 86400_000).toISOString().slice(0, 10);
}

/* ─── Client ──────────────────────────────────────────────────── */

async function cpCatalog(body: any) {
  const c = await clientCtx(body);
  if ("result" in c) return c.result;
  const { data, error } = await db().from("service_catalog")
    .select("id,name,summary,deliverables,price_cents,turnaround_days,category,proof_links")
    .eq("active", true).order("sort", { ascending: true }).limit(100);
  if (error) return fail(error);
  return { success: true, items: data || [], currency: "USD" };
}

async function cpOfferRequest(body: any) {
  const c = await clientCtx(body);
  if ("result" in c) return c.result;
  const wanted = (Array.isArray(body?.items) ? body.items : []).slice(0, MAX_LINES);
  const ids = [...new Set(wanted.map((i: any) => String(i?.id || "")).filter(Boolean))] as string[];
  if (!ids.length) return { success: false, error: "Your basket is empty." };

  const { data: catalog, error } = await db().from("service_catalog")
    .select("id,name,summary,deliverables,price_cents,turnaround_days").in("id", ids).eq("active", true);
  if (error) return fail(error);
  const byId: Record<string, any> = {};
  for (const r of (catalog || []) as any[]) byId[r.id] = r;
  const items = ids.filter((id) => byId[id]).map((id) => {
    const r = byId[id];
    const note = wanted.find((w: any) => String(w?.id) === id)?.note;
    return {
      catalog_id: id, name: r.name, deliverables: cleanDeliverables(r.deliverables),
      price_cents: r.price_cents, turnaround_days: r.turnaround_days, client_note: cleanText(note, 500),
    };
  });
  if (!items.length) return { success: false, error: "Those items are no longer available — please refresh." };
  const total = items.reduce((s, i) => s + i.price_cents, 0);

  const { data, error: insErr } = await db().from("client_offers").insert({
    project_id: c.user.project_id, client_user_id: c.user.id, status: "requested",
    items, requested_items: items, client_note: cleanText(body?.note, 1000), total_cents: total, currency: "USD",
  }).select("id,status,total_cents,created_at").single();
  if (insErr || !data) return fail(insErr);

  await createNotification({
    projectId: c.user.project_id, recipientType: "staff", recipientId: `pm:${c.user.project_id}`, kind: "offer_requested",
    title: `Offer requested by ${c.user.display_name || c.user.email} (${money(total)})`,
    body: items.map((i) => `• ${i.name} — ${money(i.price_cents)}`).join("\n"),
    payload: { offerId: (data as any).id },
  });
  return { success: true, offer: data };
}

async function cpOffersOrders(body: any) {
  const c = await clientCtx(body);
  if ("result" in c) return c.result;
  const pid = c.user.project_id;
  const [offers, orders] = await Promise.all([
    db().from("client_offers").select("id,status,items,client_note,team_note,total_cents,currency,valid_until,confirmed_at,decided_at,created_at")
      .eq("project_id", pid).neq("status", "cancelled").order("created_at", { ascending: false }).limit(50),
    db().from("client_orders").select("id,offer_id,name,deliverables,price_cents,currency,due_date,status,payment_ref,assignee,delivered_note,delivered_link,history,thanks,created_at,updated_at")
      .eq("project_id", pid).order("created_at", { ascending: false }).limit(100),
  ]);
  if (offers.error) return fail(offers.error);
  if (orders.error) return fail(orders.error);
  return {
    success: true,
    offers: offers.data || [],
    /* The payment reference is the team's bookkeeping; clients see the steps. */
    orders: ((orders.data || []) as any[]).map(({ payment_ref, ...o }) => ({ ...o, paid: !!payment_ref || o.status !== "awaiting_payment" })),
    steps: ORDER_STEPS.map((s) => ({ key: s, label: STEP_LABEL[s] })),
  };
}

async function cpOfferDecide(body: any) {
  const c = await clientCtx(body);
  if ("result" in c) return c.result;
  const decision = String(body?.decision || "");
  if (!["accept", "decline"].includes(decision)) return { success: false, error: "decision must be accept or decline" };
  const { data: offer, error } = await db().from("client_offers").select("*")
    .eq("id", String(body?.offerId || "")).eq("project_id", c.user.project_id).maybeSingle();
  if (error) return fail(error);
  if (!offer) return { success: false, error: "Offer not found." };
  const o = offer as any;
  if (o.status !== "confirmed") return { success: false, error: o.status === "requested" ? "Your team is still preparing this offer." : "This offer has already been answered." };
  if (o.valid_until && o.valid_until < new Date().toISOString().slice(0, 10)) return { success: false, error: "This offer has expired — ask Manvisha for a fresh one." };

  const now = new Date().toISOString();
  if (decision === "decline") {
    await db().from("client_offers").update({ status: "declined", decided_at: now, updated_at: now }).eq("id", o.id);
    await createNotification({ projectId: o.project_id, recipientType: "staff", recipientId: `pm:${o.project_id}`, kind: "offer_declined", title: `Offer declined (${money(o.total_cents)})`, payload: { offerId: o.id } });
    return { success: true, status: "declined" };
  }

  /* Accept: flip the offer first so a double click can't create orders twice. */
  const { data: flipped } = await db().from("client_offers").update({ status: "accepted", decided_at: now, updated_at: now })
    .eq("id", o.id).eq("status", "confirmed").select("id");
  if (!flipped || !(flipped as any[]).length) return { success: false, error: "This offer has already been answered." };
  const rows = (Array.isArray(o.items) ? o.items : []).map((i: any) => ({
    project_id: o.project_id, offer_id: o.id, name: i.name, deliverables: cleanDeliverables(i.deliverables),
    price_cents: Number(i.price_cents) || 0, currency: o.currency || "USD",
    due_date: i.due_date || addDays(Number(i.turnaround_days) || 7),
    status: "awaiting_payment",
    history: [{ status: "awaiting_payment", at: now, by: c.user.display_name || c.user.email, note: "Offer accepted" }],
  }));
  const { error: insErr } = await db().from("client_orders").insert(rows);
  if (insErr) {
    await db().from("client_offers").update({ status: "confirmed", decided_at: null }).eq("id", o.id);
    return fail(insErr);
  }
  await createNotification({ projectId: o.project_id, recipientType: "staff", recipientId: `pm:${o.project_id}`, kind: "offer_accepted", title: `Offer accepted — ${money(o.total_cents)}. Waiting for payment.`, payload: { offerId: o.id } });
  return { success: true, status: "accepted", orders: rows.length };
}

async function cpOrderThanks(body: any) {
  const c = await clientCtx(body);
  if ("result" in c) return c.result;
  const message = cleanText(body?.message, 500) || "Thank you!";
  const { data, error } = await db().from("client_orders").update({ thanks: message, thanks_at: new Date().toISOString() })
    .eq("id", String(body?.orderId || "")).eq("project_id", c.user.project_id).eq("status", "delivered").select("id,name,assignee");
  if (error) return fail(error);
  if (!data || !(data as any[]).length) return { success: false, error: "You can say thanks once the work is delivered." };
  const order = (data as any[])[0];
  await createNotification({ projectId: c.user.project_id, recipientType: "staff", recipientId: `pm:${c.user.project_id}`, kind: "order_thanks", title: `${c.user.display_name || "Your client"} said thanks for “${order.name}”`, body: message });
  return { success: true };
}

/* ─── Team ────────────────────────────────────────────────────── */

async function projectNames(ids: string[]) {
  if (!ids.length) return {};
  const { data } = await db().from("projects").select("id,name,url").in("id", [...new Set(ids)]);
  const out: Record<string, any> = {};
  for (const p of (data || []) as any[]) out[p.id] = p;
  return out;
}

async function cpsCatalogList() {
  const { data, error } = await db().from("service_catalog").select("*").order("sort", { ascending: true }).limit(200);
  if (error) return fail(error);
  return { success: true, items: data || [] };
}

async function cpsCatalogSave(body: any) {
  const i = body?.item || {};
  const name = cleanText(i.name, 200);
  const price = Math.round(Number(i.price_cents));
  if (!name) return { success: false, error: "Name required" };
  if (!Number.isFinite(price) || price < 0) return { success: false, error: "Price must be zero or more" };
  const row: any = {
    name, summary: cleanText(i.summary, 500), deliverables: cleanDeliverables(i.deliverables),
    price_cents: price, turnaround_days: Math.max(1, Math.round(Number(i.turnaround_days) || 7)),
    category: cleanText(i.category, 40) || "general",
    proof_links: (Array.isArray(i.proof_links) ? i.proof_links : [])
      .filter((l: any) => /^https?:\/\//i.test(String(l?.url || ""))).slice(0, 5)
      .map((l: any) => ({ title: String(l.title || l.url).slice(0, 200), url: String(l.url).slice(0, 500) })),
    active: i.active !== false, sort: Math.round(Number(i.sort) || 100), updated_at: new Date().toISOString(),
  };
  const q = i.id
    ? db().from("service_catalog").update(row).eq("id", String(i.id)).select().single()
    : db().from("service_catalog").insert(row).select().single();
  const { data, error } = await q;
  if (error) return fail(error);
  return { success: true, item: data };
}

async function cpsOffersList(body: any) {
  let q = db().from("client_offers").select("*").order("created_at", { ascending: false }).limit(200);
  if (body?.status) q = q.eq("status", String(body.status));
  if (body?.projectId) q = q.eq("project_id", String(body.projectId));
  const { data, error } = await q;
  if (error) return fail(error);
  const rows = (data || []) as any[];
  const names = await projectNames(rows.map((r) => r.project_id));
  return { success: true, offers: rows.map((r) => ({ ...r, project: names[r.project_id] || { id: r.project_id } })) };
}

async function cpsOfferConfirm(body: any, staffEmail: string | null) {
  const offerId = String(body?.offerId || "");
  const { data: offer, error } = await db().from("client_offers").select("*").eq("id", offerId).maybeSingle();
  if (error) return fail(error);
  if (!offer) return { success: false, error: "Offer not found" };
  const o = offer as any;
  if (!["requested", "confirmed"].includes(o.status)) return { success: false, error: `This offer is already ${o.status}.` };

  const items = (Array.isArray(body?.items) ? body.items : o.items).slice(0, MAX_LINES).map((i: any) => ({
    catalog_id: i.catalog_id || null,
    name: cleanText(i.name, 200) || "Item",
    deliverables: cleanDeliverables(i.deliverables),
    price_cents: Math.max(0, Math.round(Number(i.price_cents) || 0)),
    turnaround_days: Math.max(1, Math.round(Number(i.turnaround_days) || 7)),
    due_date: /^\d{4}-\d{2}-\d{2}$/.test(String(i.due_date || "")) ? i.due_date : null,
    client_note: i.client_note || null,
    team_note: cleanText(i.team_note, 500),
  }));
  if (!items.length) return { success: false, error: "An offer needs at least one item." };
  const total = items.reduce((s: number, i: any) => s + i.price_cents, 0);
  const validUntil = /^\d{4}-\d{2}-\d{2}$/.test(String(body?.validUntil || "")) ? body.validUntil : addDays(14);
  const now = new Date().toISOString();
  const { error: upErr } = await db().from("client_offers").update({
    status: "confirmed", items, total_cents: total, team_note: cleanText(body?.teamNote, 1500),
    valid_until: validUntil, confirmed_by: staffEmail, confirmed_at: now, updated_at: now,
  }).eq("id", offerId);
  if (upErr) return fail(upErr);
  emailProjectClients(o.project_id, "Your SEO Season offer is ready",
    `Your offer is ready to review: ${items.length} item${items.length > 1 ? "s" : ""}, ${money(total)} in total.\nEverything included is listed line by line. It's valid until ${validUntil}.`,
    "/c/orders").catch(() => {});
  return { success: true, total_cents: total, valid_until: validUntil };
}

async function cpsOfferCancel(body: any) {
  const { error } = await db().from("client_offers").update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", String(body?.offerId || "")).in("status", ["requested", "confirmed"]);
  return error ? fail(error) : { success: true };
}

async function cpsOrdersList(body: any) {
  let q = db().from("client_orders").select("*").order("updated_at", { ascending: false }).limit(300);
  if (body?.status) q = q.eq("status", String(body.status));
  if (body?.projectId) q = q.eq("project_id", String(body.projectId));
  const { data, error } = await q;
  if (error) return fail(error);
  const rows = (data || []) as any[];
  const names = await projectNames(rows.map((r) => r.project_id));
  return { success: true, orders: rows.map((r) => ({ ...r, project: names[r.project_id] || { id: r.project_id } })), steps: ORDER_STEPS };
}

async function cpsOrderUpdate(body: any, staffEmail: string | null) {
  const { data: order, error } = await db().from("client_orders").select("*").eq("id", String(body?.orderId || "")).maybeSingle();
  if (error) return fail(error);
  if (!order) return { success: false, error: "Order not found" };
  const o = order as any;
  const patch: any = { updated_at: new Date().toISOString() };
  const status = body?.status ? String(body.status) : null;
  if (status && !ORDER_STATUSES.has(status)) return { success: false, error: "Unknown status" };
  if (status === "payment_received" && !cleanText(body?.paymentRef ?? o.payment_ref, 200)) {
    return { success: false, error: "Add the payment reference from your payment platform first." };
  }
  if (body?.paymentRef !== undefined) patch.payment_ref = cleanText(body.paymentRef, 200);
  if (body?.assignee !== undefined) patch.assignee = cleanText(body.assignee, 120);
  if (body?.dueDate !== undefined) patch.due_date = /^\d{4}-\d{2}-\d{2}$/.test(String(body.dueDate)) ? body.dueDate : null;
  if (body?.deliveredNote !== undefined) patch.delivered_note = cleanText(body.deliveredNote, 2000);
  if (body?.deliveredLink !== undefined) patch.delivered_link = /^https?:\/\//i.test(String(body.deliveredLink || "")) ? String(body.deliveredLink).slice(0, 500) : null;
  const changed = status && status !== o.status;
  if (changed) {
    patch.status = status;
    patch.history = [...(Array.isArray(o.history) ? o.history : []), { status, at: patch.updated_at, by: staffEmail, note: cleanText(body?.note, 500) }];
  }
  const { error: upErr } = await db().from("client_orders").update(patch).eq("id", o.id);
  if (upErr) return fail(upErr);
  if (changed && status === "delivered") {
    const { recordWin } = await import("./client-wins.js");
    await recordWin(o.project_id, { kind: "order_delivered", key: `order:${o.id}`, title: `Done: ${o.name}`, detail: patch.delivered_note || o.delivered_note || undefined, by: staffEmail || "team" }).catch(() => false);
  }
  if (changed && status !== "cancelled") {
    const extra = status === "delivered" && (patch.delivered_note || o.delivered_note) ? `\n\n${patch.delivered_note || o.delivered_note}` : "";
    emailProjectClients(o.project_id, `“${o.name}”: ${STEP_LABEL[status]}`, `Update on “${o.name}”: ${STEP_LABEL[status]}.${extra}`, "/c/orders").catch(() => {});
  }
  return { success: true };
}

/* ─── Router ──────────────────────────────────────────────────── */

export const MONEY_PUBLIC_ACTIONS = ["cp_catalog", "cp_offer_request", "cp_offers_orders", "cp_offer_decide", "cp_order_thanks"];

export async function handleMoneyFlow(action: string, body: any, staffEmail: string | null): Promise<any | null> {
  switch (action) {
    case "cp_catalog":         return cpCatalog(body);
    case "cp_offer_request":   return cpOfferRequest(body);
    case "cp_offers_orders":   return cpOffersOrders(body);
    case "cp_offer_decide":    return cpOfferDecide(body);
    case "cp_order_thanks":    return cpOrderThanks(body);
    case "cps_catalog_list":   return cpsCatalogList();
    case "cps_catalog_save":   return cpsCatalogSave(body);
    case "cps_offers_list":    return cpsOffersList(body);
    case "cps_offer_confirm":  return cpsOfferConfirm(body, staffEmail);
    case "cps_offer_cancel":   return cpsOfferCancel(body);
    case "cps_orders_list":    return cpsOrdersList(body);
    case "cps_order_update":   return cpsOrderUpdate(body, staffEmail);
    default: return null;
  }
}
