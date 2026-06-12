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

const STATUSES = ["lead", "qualifying", "proposal", "negotiating", "demo_requested", "closing", "hired", "in_delivery", "repeat", "stalled", "lost", "archived"];

async function dealContext(id: string, conversation: string): Promise<{ conversation: string; facts: string; attachments: string; strategySummary: string }> {
  let facts = ""; let attachments = ""; let strategySummary = "";
  if (id) {
    try {
      const { data } = await db().from("bd_deals").select("conversation, strategy, attachments").eq("id", id).single();
      const d = data as any;
      if (d) {
        conversation = conversation || d.conversation || "";
        facts = JSON.stringify(d.strategy?.deal_facts || {});
        strategySummary = String(d.strategy?.deal_state?.summary || "");
        if (Array.isArray(d.attachments)) attachments = d.attachments.map((a: any) => `[${a.kind}: ${a.name}]\n${String(a.text || "").slice(0, 5000)}`).join("\n\n");
      }
    } catch { /* ignore */ }
  }
  return { conversation, facts, attachments, strategySummary };
}

async function persistDiag(id: string, kind: string, name: string, text: string): Promise<void> {
  if (!id) return;
  try {
    const { data } = await db().from("bd_deals").select("attachments").eq("id", id).single();
    const existing = Array.isArray((data as any)?.attachments) ? (data as any).attachments.filter((a: any) => a.kind !== kind) : [];
    await db().from("bd_deals").update({ attachments: [...existing, { name, kind, text, added_at: new Date().toISOString() }], updated_at: new Date().toISOString() }).eq("id", id);
  } catch { /* non-fatal */ }
}

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

  if (action === "bd_deal_update") {
    const id = String(body?.id || "").trim();
    if (!id) return { success: false, error: "id required." };
    const upd: any = { updated_at: new Date().toISOString() };
    if (typeof body?.status === "string" && STATUSES.includes(body.status)) upd.status = body.status;
    if (Array.isArray(body?.tags)) upd.tags = body.tags.map((t: any) => String(t).slice(0, 40)).filter(Boolean).slice(0, 20);
    if (typeof body?.client_name === "string" && body.client_name.trim()) upd.client_name = body.client_name.slice(0, 200);
    try {
      const { data, error } = await db().from("bd_deals").update(upd).eq("id", id).select().single();
      if (error) return { success: false, error: error.message };
      return { success: true, deal: data };
    } catch (e: any) { return { success: false, error: e?.message || "update failed" }; }
  }

  if (action === "bd_deal_list") {
    try {
      let q = db().from("bd_deals").select("id, client_name, client_handle, platform, brief, status, tags, last_message_at, updated_at, strategy").order("updated_at", { ascending: false }).limit(200);
      const status = String(body?.status || "").trim();
      if (status && status !== "all") {
        if (status === "active") q = q.not("status", "in", "(hired,repeat,lost,archived)");
        else if (status === "won") q = q.in("status", ["hired", "repeat", "in_delivery"]);
        else if (status === "archived") q = q.eq("status", "archived");
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

  if (action === "bd_aeo_check") {
    const siteUrl = String(body?.siteUrl || "").trim();
    if (!siteUrl) return { success: false, error: "No client site URL — detect it from the chat or add it." };
    try {
      const { aeoReadinessCheck } = await import("./bd-diagnostics.js");
      const r = await aeoReadinessCheck(siteUrl);
      if (!r.ok || !r.report) return { success: false, error: r.error || "AEO check failed." };
      const rep = r.report;
      await persistDiag(String(body?.id || "").trim(), "aeo", "AEO/GEO readiness", `AEO/GEO readiness for ${rep.site}: ${rep.signals.filter(s => s.ok).length}/${rep.signals.length} signals OK. Schema: ${rep.schema_types.join(", ") || "none"}. llms.txt: ${rep.llms_txt ? "yes" : "no"}. ${rep.robots_ai}. Top fixes: ${rep.recommendations.slice(0, 3).join("; ")}.`);
      return { success: true, report: rep };
    } catch (e: any) { return { success: false, error: e?.message || "AEO check failed" }; }
  }

  if (action === "bd_competitor_snapshot") {
    const siteUrl = String(body?.siteUrl || "").trim();
    const competitors = (Array.isArray(body?.competitors) ? body.competitors : []).map((c: any) => String(c).trim()).filter(Boolean);
    const keywords = (Array.isArray(body?.keywords) ? body.keywords : []).map((k: any) => String(k).trim()).filter(Boolean);
    if (!competitors.length) return { success: false, error: "Add at least one competitor domain (detected from the chat or typed)." };
    if (!keywords.length) return { success: false, error: "Add a few target keywords to compare on." };
    try {
      const { benchmarkCompetitors } = await import("./competitor-benchmark.js");
      const report = await benchmarkCompetitors({ projectId: String(body?.projectId || ""), competitors, keywords, siteUrl, maxQueries: 8, maxContentGaps: 5 });
      await persistDiag(String(body?.id || "").trim(), "competitor", "Competitor snapshot", report.summary || `Competitor snapshot vs ${competitors.join(", ")}.`);
      return { success: true, report };
    } catch (e: any) { return { success: false, error: e?.message || "competitor snapshot failed" }; }
  }

  if (action === "bd_build_offer") {
    const c = await dealContext(String(body?.id || "").trim(), String(body?.conversation || ""));
    if (!c.conversation.trim() && !c.facts) return { success: false, error: "Analyse the chat first so I have the facts to price." };
    try { const { buildOffer } = await import("./bd-strategist.js"); const r = await buildOffer(c); return r.ok ? { success: true, offer: r.offer } : { success: false, error: r.error }; }
    catch (e: any) { return { success: false, error: e?.message || "offer failed" }; }
  }

  if (action === "bd_build_roadmap") {
    const c = await dealContext(String(body?.id || "").trim(), String(body?.conversation || ""));
    if (!c.conversation.trim() && !c.facts) return { success: false, error: "Analyse the chat first." };
    try { const { buildRoadmap } = await import("./bd-strategist.js"); const r = await buildRoadmap(c); return r.ok ? { success: true, roadmap: r.roadmap } : { success: false, error: r.error }; }
    catch (e: any) { return { success: false, error: e?.message || "roadmap failed" }; }
  }

  if (action === "bd_reply_variants") {
    const c = await dealContext(String(body?.id || "").trim(), String(body?.conversation || ""));
    if (!c.conversation.trim()) return { success: false, error: "Paste the conversation first." };
    try { const { replyVariants } = await import("./bd-strategist.js"); const r = await replyVariants(c); return r.ok ? { success: true, variants: r.variants } : { success: false, error: r.error }; }
    catch (e: any) { return { success: false, error: e?.message || "variants failed" }; }
  }

  if (action === "bd_ask") {
    const question = String(body?.question || "").trim();
    if (!question) return { success: false, error: "Type your question or what you are thinking." };
    const c = await dealContext(String(body?.id || "").trim(), String(body?.conversation || ""));
    try {
      const { askExpert } = await import("./bd-strategist.js");
      const r = await askExpert({ question, conversation: c.conversation, facts: c.facts, attachments: c.attachments, strategySummary: c.strategySummary });
      if (!r.ok) return { success: false, error: r.error };
      return { success: true, answer: r.answer, client_reply: r.client_reply, suggested_tools: r.suggested_tools };
    } catch (e: any) { return { success: false, error: e?.message || "ask failed" }; }
  }

  if (action === "bd_run_audit") {
    const siteUrl = String(body?.siteUrl || "").trim();
    if (!siteUrl) return { success: false, error: "No client site URL to audit — add it or detect it from the chat." };
    try {
      const { crawlSite } = await import("./site-crawler.js");
      const report = await crawlSite({ projectId: String(body?.projectId || ""), siteUrl, maxPages: Math.min(Number(body?.maxPages) || 40, 60) });
      /* Persist a concise summary on the deal so it informs future strategy. */
      const id = String(body?.id || "").trim();
      if (id && report.pages_reachable > 0) {
        try {
          const issues = Object.entries(report.issues || {}).map(([k, v]: any) => `${v.count} ${String(k).replace(/_/g, " ")}`).join(", ");
          const text = `Quick site audit of ${report.project_domain} — crawled ${report.pages_reachable} pages. Issues: ${issues || "none of the tracked issues"}.${report.performance ? ` Performance ${report.performance.performance_score}/100, LCP ${report.performance.lcp}.` : ""} Schema found: ${Object.keys(report.schema_coverage || {}).join(", ") || "none"}.`;
          const { data: deal } = await db().from("bd_deals").select("attachments").eq("id", id).single();
          const existing = Array.isArray((deal as any)?.attachments) ? (deal as any).attachments.filter((a: any) => a.kind !== "audit") : [];
          await db().from("bd_deals").update({ attachments: [...existing, { name: "Quick site audit", kind: "audit", text, added_at: new Date().toISOString() }], updated_at: new Date().toISOString() }).eq("id", id);
        } catch { /* non-fatal */ }
      }
      return { success: report.pages_reachable > 0, report };
    } catch (e: any) { return { success: false, error: e?.message || "audit failed" }; }
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
