/* ════════════════════════════════════════════════════════════════
   api/lib/bd-engine.ts

   BUILD 12.39 — Deal workspace backend.

   Manages inbound client deals: each deal holds the running conversation,
   brief, status, notes, reminders, and the latest conversion strategy.
   Actions (dispatched via task-engine on the bd_ prefix):
     bd_deal_save       create or update a deal (conversation/status/notes/...)
     bd_deal_list       list deals, filter by status, search by text
     bd_deal_get        fetch one deal
     bd_strategize      run the strategist on a deal and store the result
     bd_deal_delete     remove a deal

   Storage: bd_deals (migration run in Supabase first).
   Multi-tenant: project_id optional; deals are the unit of work.
════════════════════════════════════════════════════════════════ */

import { db } from "./db.js";

const STATUSES = ["lead", "qualifying", "proposal", "negotiating", "demo_requested", "closing", "hired", "in_delivery", "repeat", "stalled", "lost"];

export async function handleBd(action: string, body: any): Promise<any> {
  if (action === "bd_deal_save") {
    const d = body || {};
    const row: any = {
      client_name: String(d.client_name || "Untitled lead").slice(0, 200),
      client_handle: d.client_handle ? String(d.client_handle).slice(0, 120) : null,
      platform: String(d.platform || "fiverr").slice(0, 40),
      brief: d.brief != null ? String(d.brief) : null,
      conversation: d.conversation != null ? String(d.conversation) : null,
      status: STATUSES.includes(d.status) ? d.status : "lead",
      notes: d.notes != null ? String(d.notes) : null,
      reminders: Array.isArray(d.reminders) ? d.reminders : [],
      tags: Array.isArray(d.tags) ? d.tags : [],
      project_id: d.projectId || d.project_id || null,
      last_message_at: d.conversation ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    };
    try {
      if (d.id) {
        const { data, error } = await db().from("bd_deals").update(row).eq("id", d.id).select().single();
        if (error) return { success: false, error: error.message };
        return { success: true, deal: data };
      }
      const { data, error } = await db().from("bd_deals").insert(row).select().single();
      if (error) return { success: false, error: error.message };
      return { success: true, deal: data };
    } catch (e: any) { return { success: false, error: e?.message || "save failed" }; }
  }

  if (action === "bd_deal_list") {
    try {
      let q = db().from("bd_deals").select("id, client_name, client_handle, platform, brief, status, tags, last_message_at, updated_at, strategy").order("updated_at", { ascending: false }).limit(200);
      const status = String(body?.status || "").trim();
      if (status && status !== "all") {
        if (status === "active") q = q.not("status", "in", "(hired,repeat,lost)");
        else if (status === "won") q = q.in("status", ["hired", "repeat", "in_delivery"]);
        else q = q.eq("status", status);
      }
      const search = String(body?.search || "").trim();
      if (search) q = q.or(`client_name.ilike.%${search}%,brief.ilike.%${search}%,conversation.ilike.%${search}%`);
      const { data, error } = await q;
      if (error) return { success: false, error: error.message };
      return { success: true, deals: data || [] };
    } catch (e: any) { return { success: false, error: e?.message || "list failed" }; }
  }

  if (action === "bd_deal_get") {
    const id = String(body?.id || "").trim();
    if (!id) return { success: false, error: "id required." };
    try {
      const { data, error } = await db().from("bd_deals").select("*").eq("id", id).single();
      if (error) return { success: false, error: error.message };
      return { success: true, deal: data };
    } catch (e: any) { return { success: false, error: e?.message || "get failed" }; }
  }

  if (action === "bd_deal_attach") {
    const id = String(body?.id || "").trim();
    if (!id) return { success: false, error: "id required." };
    const att = { name: String(body?.name || "attachment").slice(0, 200), kind: String(body?.kind || "file"), text: String(body?.text || "").slice(0, 120000), added_at: new Date().toISOString() };
    if (!att.text.trim()) return { success: false, error: "No readable text in the attachment (images need their text pasted)." };
    try {
      const { data: deal } = await db().from("bd_deals").select("attachments").eq("id", id).single();
      const existing = Array.isArray((deal as any)?.attachments) ? (deal as any).attachments : [];
      const { data, error } = await db().from("bd_deals").update({ attachments: [...existing, att], updated_at: new Date().toISOString() }).eq("id", id).select().single();
      if (error) return { success: false, error: error.message };
      return { success: true, deal: data };
    } catch (e: any) { return { success: false, error: e?.message || "attach failed" }; }
  }

  if (action === "bd_strategize") {
    const id = String(body?.id || "").trim();
    let conversation = String(body?.conversation || "");
    let brief = String(body?.brief || "");
    let clientName = String(body?.client_name || "");
    let deal: any = null;
    if (id) {
      try { const { data } = await db().from("bd_deals").select("*").eq("id", id).single(); deal = data; } catch { /* ignore */ }
      if (deal) { conversation = conversation || deal.conversation || ""; brief = brief || deal.brief || ""; clientName = clientName || deal.client_name || ""; }
    }
    if (!conversation.trim()) return { success: false, error: "No conversation to strategise. Paste the client chat first." };
    try {
      const { strategizeDeal } = await import("./bd-strategist.js");
      let context = String(body?.context || "");
      if (deal && Array.isArray(deal.attachments) && deal.attachments.length) {
        const fromAtt = deal.attachments.map((a: any) => `[${a.kind || "file"}: ${a.name || "attachment"}]\n${String(a.text || "").slice(0, 12000)}`).join("\n\n");
        context = fromAtt + (context ? "\n\n" + context : "");
      }
      const r = await strategizeDeal({ conversation, brief, clientName, context });
      if (!r.ok) return { success: false, error: r.error, strategy: r.strategy };
      if (id && deal) {
        try {
          const detected = String(r.strategy.detected_client || "").trim();
          const curName = String(deal.client_name || "").trim();
          const nameUpdate = (detected && (!curName || curName === "Untitled lead")) ? { client_name: detected } : {};
          await db().from("bd_deals").update({ strategy: r.strategy, status: STATUSES.includes(r.strategy.deal_state.stage) ? r.strategy.deal_state.stage : deal.status, ...nameUpdate, updated_at: new Date().toISOString() }).eq("id", id);
        } catch { /* non-fatal */ }
      }
      return { success: true, strategy: r.strategy };
    } catch (e: any) { return { success: false, error: e?.message || "strategize failed" }; }
  }

  if (action === "bd_deal_delete") {
    const id = String(body?.id || "").trim();
    if (!id) return { success: false, error: "id required." };
    try { await db().from("bd_deals").delete().eq("id", id); return { success: true }; }
    catch (e: any) { return { success: false, error: e?.message || "delete failed" }; }
  }

  return { success: false, error: `Unknown bd action: ${action}` };
}
