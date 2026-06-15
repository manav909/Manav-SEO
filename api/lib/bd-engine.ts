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
  noteCall(id);
  return { conversation, facts, attachments, strategySummary };
}
function noteCall(id: string) { if (id) bumpApiCalls(id).catch(() => { }); }

async function bumpApiCalls(id: string, n = 1): Promise<void> {
  if (!id) return;
  try { const { data } = await db().from("bd_deals").select("api_calls").eq("id", id).single(); const cur = Number((data as any)?.api_calls || 0); await db().from("bd_deals").update({ api_calls: cur + n }).eq("id", id); } catch { /* non-fatal */ }
}
async function appendStage(id: string, stage: string): Promise<void> {
  if (!id || !stage) return;
  try {
    const { data } = await db().from("bd_deals").select("stage_history").eq("id", id).single();
    const hist = Array.isArray((data as any)?.stage_history) ? (data as any).stage_history : [];
    if (hist.length && hist[hist.length - 1]?.stage === stage) return;
    hist.push({ stage, at: new Date().toISOString() });
    await db().from("bd_deals").update({ stage_history: hist }).eq("id", id);
  } catch { /* non-fatal */ }
}
function aggBy(list: any[], key: string): Array<{ key: string; count: number; value: number }> {
  const m = new Map<string, { count: number; value: number }>();
  for (const d of list) { const k = (d[key] || "Unknown").toString().trim() || "Unknown"; const e = m.get(k) || { count: 0, value: 0 }; e.count++; e.value += Number(d.deal_value || 0); m.set(k, e); }
  return [...m.entries()].map(([k, v]) => ({ key: k, count: v.count, value: v.value })).sort((a, b) => b.count - a.count).slice(0, 12);
}

async function persistDiag(id: string, kind: string, name: string, text: string): Promise<void> {
  if (!id) return;
  try {
    const { data } = await db().from("bd_deals").select("attachments").eq("id", id).single();
    const existing = Array.isArray((data as any)?.attachments) ? (data as any).attachments.filter((a: any) => a.kind !== kind) : [];
    await db().from("bd_deals").update({ attachments: [...existing, { name, kind, text, added_at: new Date().toISOString() }], updated_at: new Date().toISOString() }).eq("id", id);
  } catch { /* non-fatal */ }
}

/* Clean, professional, print-ready document renderer for generated client docs. */
function renderDocHtml(doc: { title: string; subtitle: string; recipient: string; sections: Array<{ heading: string; body: string }>; footer: string }, brand: string, language: string): string {
  const esc = (s: string) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const inline = (s: string) => esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\*(.+?)\*/g, "<em>$1</em>");
  const rtl = /Arabic|Urdu/i.test(language);
  const body = (txt: string): string => {
    const lines = String(txt || "").split("\n"); let out = ""; let inList = false;
    for (const raw of lines) {
      const t = raw.trim();
      if (!t) { if (inList) { out += "</ul>"; inList = false; } continue; }
      if (/^[-*•]\s+/.test(t)) { if (!inList) { out += "<ul>"; inList = true; } out += "<li>" + inline(t.replace(/^[-*•]\s+/, "")) + "</li>"; }
      else { if (inList) { out += "</ul>"; inList = false; } out += "<p>" + inline(t) + "</p>"; }
    }
    if (inList) out += "</ul>";
    return out;
  };
  const today = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const sections = (doc.sections || []).map(s => `<section>${s.heading ? `<h2>${esc(s.heading)}</h2>` : ""}${body(s.body)}</section>`).join("");
  return `<!doctype html><html dir="${rtl ? "rtl" : "ltr"}" lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>
:root{--ink:#1a1a2e;--muted:#5b5b78;--accent:#6366f1;--line:#e7e7f0;--bg:#ffffff}
*{box-sizing:border-box}
body{margin:0;background:#f4f4f8;color:var(--ink);font-family:Georgia,'Times New Roman',serif;line-height:1.7;font-size:15px}
.page{max-width:780px;margin:24px auto;background:var(--bg);padding:56px 64px;box-shadow:0 4px 24px rgba(20,20,50,.08);border-radius:4px}
.eyebrow{font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:var(--accent);font-weight:700;margin:0 0 10px}
h1{font-size:30px;line-height:1.2;margin:0 0 8px;letter-spacing:-.01em}
.sub{font-size:16px;color:var(--muted);margin:0 0 20px;font-style:italic}
.meta{font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:12px;color:var(--muted);border-top:1px solid var(--line);border-bottom:1px solid var(--line);padding:12px 0;margin:0 0 28px;display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px}
h2{font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:14px;letter-spacing:.06em;text-transform:uppercase;color:var(--accent);margin:30px 0 10px;font-weight:700}
section:first-of-type h2{margin-top:0}
p{margin:0 0 12px}
ul{margin:0 0 14px;padding-${rtl ? "right" : "left"}:20px}
li{margin:0 0 7px}
strong{color:var(--ink);font-weight:700}
.footer{font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:13px;color:var(--muted);border-top:2px solid var(--accent);margin-top:34px;padding-top:16px;font-style:italic}
.brand{font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-weight:700;color:var(--ink);font-style:normal}
@media print{body{background:#fff}.page{box-shadow:none;margin:0;max-width:none;padding:0}}
</style></head>
<body><div class="page">
<div class="eyebrow">${esc(brand)} · SEO &amp; AEO</div>
<h1>${esc(doc.title)}</h1>
${doc.subtitle ? `<div class="sub">${esc(doc.subtitle)}</div>` : ""}
<div class="meta"><span>${doc.recipient ? "Prepared for " + esc(doc.recipient) : "Prepared by " + esc(brand)}</span><span>${today}</span></div>
${sections}
${doc.footer ? `<div class="footer">${inline(doc.footer)}<br><span class="brand">${esc(brand)}</span></div>` : `<div class="footer"><span class="brand">${esc(brand)}</span></div>`}
</div></body></html>`;
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
      if (upd.status) appendStage(id, upd.status);
      return { success: true, deal: data };
    } catch (e: any) { return { success: false, error: e?.message || "update failed" }; }
  }

  if (action === "bd_deal_find") {
    const handle = String(body?.client_handle || "").trim().slice(0, 120);
    const platform = String(body?.platform || "fiverr").trim().slice(0, 40);
    const name = String(body?.client_name || "").trim().slice(0, 200);
    if (!handle) return { success: false, error: "No client handle to identify the deal." };
    try {
      const { data: found } = await db().from("bd_deals").select("*").eq("client_handle", handle).eq("platform", platform).order("updated_at", { ascending: false }).limit(1);
      if (Array.isArray(found) && found.length) return { success: true, deal: found[0], created: false };
      const row: any = { client_name: name || handle, client_handle: handle, platform, status: "lead", updated_at: new Date().toISOString() };
      const { data, error } = await db().from("bd_deals").insert(row).select().single();
      if (error) return { success: false, error: error.message };
      return { success: true, deal: data, created: true };
    } catch (e: any) { return { success: false, error: e?.message || "deal find failed" }; }
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

  if (action === "bd_casestudy_save") {
    const cs = body || {};
    const row: any = { title: String(cs.title || "").slice(0, 200), summary: String(cs.summary || ""), results: String(cs.results || ""), industry: String(cs.industry || "").slice(0, 120), tags: Array.isArray(cs.tags) ? cs.tags.map((t: any) => String(t).slice(0, 40)).filter(Boolean) : [] };
    if (!row.title && !row.summary) return { success: false, error: "Add at least a title or summary." };
    try {
      if (cs.id) { const { data, error } = await db().from("bd_case_studies").update(row).eq("id", cs.id).select().single(); if (error) return { success: false, error: error.message }; return { success: true, case_study: data }; }
      const { data, error } = await db().from("bd_case_studies").insert(row).select().single(); if (error) return { success: false, error: error.message }; return { success: true, case_study: data };
    } catch (e: any) { return { success: false, error: e?.message || "save failed" }; }
  }
  if (action === "bd_casestudy_list") {
    try { const { data, error } = await db().from("bd_case_studies").select("*").order("created_at", { ascending: false }).limit(200); if (error) return { success: false, error: error.message }; return { success: true, case_studies: data || [] }; }
    catch (e: any) { return { success: false, error: e?.message || "list failed" }; }
  }
  if (action === "bd_casestudy_delete") {
    const id = String(body?.id || "").trim(); if (!id) return { success: false, error: "id required." };
    try { await db().from("bd_case_studies").delete().eq("id", id); return { success: true }; } catch (e: any) { return { success: false, error: e?.message || "delete failed" }; }
  }
  if (action === "bd_casestudy_match") {
    const c = await dealContext(String(body?.id || "").trim(), String(body?.conversation || ""));
    try {
      const { data } = await db().from("bd_case_studies").select("*").order("created_at", { ascending: false }).limit(100);
      const list = (data as any[]) || [];
      if (!list.length) return { success: false, error: "No case studies in your library yet — add one first." };
      const { matchCaseStudy } = await import("./bd-strategist.js");
      const r = await matchCaseStudy({ caseStudies: list.map(x => ({ id: x.id, title: x.title, summary: x.summary, results: x.results, industry: x.industry, tags: x.tags || [] })), conversation: c.conversation, facts: c.facts });
      if (!r.ok) return { success: false, error: r.error };
      const matched = list.find(x => x.id === r.best_id) || list[0];
      return { success: true, matched: { title: matched.title, industry: matched.industry }, why: r.why, client_snippet: r.client_snippet };
    } catch (e: any) { return { success: false, error: e?.message || "match failed" }; }
  }

  if (action === "bd_casestudy_generate") {
    const c = await dealContext(String(body?.id || "").trim(), String(body?.conversation || ""));
    if (!c.conversation.trim() && !c.facts) return { success: false, error: "Analyse the chat first so I can tailor the case study." };
    try {
      const { generateCaseStudy } = await import("./bd-strategist.js");
      const r = await generateCaseStudy({ conversation: c.conversation, facts: c.facts });
      return r.ok ? { success: true, draft: r.draft } : { success: false, error: r.error };
    } catch (e: any) { return { success: false, error: e?.message || "generate failed" }; }
  }

  if (action === "bd_generate_doc") {
    const id = String(body?.id || "").trim();
    const docType = String(body?.docType || "proposal");
    const c = await dealContext(id, String(body?.conversation || ""));
    let deal: any = null; let strategy: any = null;
    if (id) { try { const { data } = await db().from("bd_deals").select("*").eq("id", id).single(); deal = data; strategy = (deal as any)?.strategy; } catch { /* ignore */ } }
    if (!c.conversation.trim() && !c.facts && !strategy) return { success: false, error: "Analyse the chat first so the document has real context to work from." };
    // Auto-gather: if this doc benefits from site data and none is on the deal yet, run a fresh audit.
    let auditText = c.attachments || "";
    const siteUrl = String(body?.siteUrl || strategy?.client_site || (strategy?.deal_facts?.urls || [])[0] || "").trim();
    const needsSite = ["proposal", "audit_report", "strategy_brief", "pitch_email"].includes(docType);
    const hasAuditCtx = /\b(audit|crawl|pages|schema|performance|aeo|readiness)\b/i.test(auditText);
    if (needsSite && !hasAuditCtx && siteUrl) {
      try {
        const { crawlSite } = await import("./site-crawler.js");
        const report = await crawlSite({ projectId: id, siteUrl, maxPages: 30 });
        if (report && report.pages_reachable > 0) {
          const issues = Object.entries(report.issues || {}).map(([k, v]: any) => `${(v as any).count} ${String(k).replace(/_/g, " ")}`).join(", ");
          const fresh = `Site audit of ${report.project_domain} — crawled ${report.pages_reachable} pages. Issues found: ${issues || "none of the tracked issues"}.${report.performance ? ` Performance ${report.performance.performance_score}/100, LCP ${report.performance.lcp}.` : ""} Schema present: ${Object.keys(report.schema_coverage || {}).join(", ") || "none"}.`;
          auditText = fresh + (auditText ? "\n\n" + auditText : "");
          await persistDiag(id, "audit", "Quick site audit", fresh);
        }
      } catch { /* non-fatal — generate from conversation/facts */ }
    }
    // Real, traceable grounding: current algorithm knowledge + proven results.
    const [algoR, brainR] = await Promise.allSettled([
      db().from("algorithm_knowledge").select("topic,summary,recommendations").order("freshness_score", { ascending: false }).limit(8),
      db().from("brain_learnings").select("card_title,improvement,what_worked").order("applied_count", { ascending: false }).limit(8),
    ]);
    const algorithmKnowledge = algoR.status === "fulfilled" ? ((algoR.value.data as any[]) || []).map((a: any) => `${a.topic}: ${a.summary}${a.recommendations ? ` (Do: ${a.recommendations})` : ""}`).join("\n") : "";
    const provenResults = brainR.status === "fulfilled" ? ((brainR.value.data as any[]) || []).map((b: any) => `${b.card_title}: ${b.improvement}${Array.isArray(b.what_worked) && b.what_worked.length ? ` — what worked: ${b.what_worked.join(", ")}` : ""}`).join("\n") : "";
    try {
      const { generateDoc } = await import("./bd-strategist.js");
      const r = await generateDoc({ docType, brandName: "Manav S", conversation: c.conversation, strategy, facts: c.facts, auditText, leadInfo: { url: siteUrl, name: (deal as any)?.client_name || "", industry: strategy?.deal_facts?.industry || "" }, language: String(body?.language || "US English"), currency: String(body?.currency || "USD"), algorithmKnowledge, provenResults });
      if (!r.ok || !r.doc) return { success: false, error: r.error || "Could not generate the document." };
      const html = renderDocHtml(r.doc, "Manav S", String(body?.language || "US English"));
      const plain = r.doc.sections.map(s => (s.heading ? s.heading + "\n" : "") + s.body).join("\n\n");
      if (id) { try { await persistDiag(id, "doc:" + docType, r.doc.title || docType, plain.slice(0, 8000)); } catch { /* ignore */ } }
      return { success: true, html, title: r.doc.title, docType };
    } catch (e: any) { return { success: false, error: e?.message || "doc generation failed" }; }
  }

  if (action === "bd_ingest_order") {
    const id = String(body?.id || "").trim();
    const text = String(body?.orderText || body?.text || "").trim();
    if (!id) return { success: false, error: "Save the deal first, then paste the order." };
    if (!text) return { success: false, error: "Paste the Fiverr Order page content." };
    try {
      const { extractOrder } = await import("./bd-strategist.js");
      const r = await extractOrder(text);
      if (!r.ok || !r.order) return { success: false, error: r.error || "Could not read the order page." };
      const summary = r.summary || "Fiverr order";
      const { data } = await db().from("bd_deals").select("attachments, status").eq("id", id).single();
      const existing = Array.isArray((data as any)?.attachments) ? (data as any).attachments.filter((a: any) => a.kind !== "order") : [];
      const orderAtt = { name: "Fiverr order" + (r.order.order_number ? ` ${r.order.order_number}` : ""), kind: "order", text: summary, order: r.order, added_at: new Date().toISOString() };
      const curStatus = String((data as any)?.status || "");
      const nextStatus = ["repeat", "completed", "hired"].includes(curStatus) ? curStatus : "in_delivery";
      const { data: updated } = await db().from("bd_deals").update({ attachments: [...existing, orderAtt], status: nextStatus, last_message_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", id).select().single();
      return { success: true, order: r.order, summary, deal: updated };
    } catch (e: any) { return { success: false, error: e?.message || "order ingest failed" }; }
  }

  if (action === "bd_engagement") {
    const id = String(body?.id || "").trim();
    const c = await dealContext(id, String(body?.conversation || ""));
    if (!c.conversation.trim() && !c.facts) return { success: false, error: "Analyse the chat first so there is a history to track." };
    let deal: any = null; let strategy: any = null;
    if (id) { try { const { data } = await db().from("bd_deals").select("*").eq("id", id).single(); deal = data; strategy = (deal as any)?.strategy; } catch { /* ignore */ } }
    const atts = Array.isArray((deal as any)?.attachments) ? (deal as any).attachments : [];
    const orderInfo = (atts.find((a: any) => a.kind === "order") as any)?.order || null;
    const deliveredDocs = atts.filter((a: any) => ["delivered", "doc", "file"].includes(a.kind) || String(a.kind || "").startsWith("doc:")).map((a: any) => `[${a.name || a.kind}]\n${String(a.text || "").slice(0, 4000)}`).join("\n\n");
    try {
      const { analyzeEngagement } = await import("./bd-strategist.js");
      const r = await analyzeEngagement({ conversation: c.conversation, orderInfo, deliveredDocs, facts: c.facts, strategySummary: c.strategySummary });
      if (!r.ok || !r.engagement) return { success: false, error: r.error || "Could not build the engagement picture." };
      const e = r.engagement;
      const summary = [
        e.client_mood ? `Client mood: ${e.client_mood}` : "",
        e.delivered?.length ? `Delivered (closed): ${e.delivered.join("; ")}` : "",
        e.open_items?.length ? `Still open: ${e.open_items.join("; ")}` : "",
        e.needs_shift ? `Needs shift: ${e.needs_shift}` : "",
        e.missed_or_at_risk?.length ? `Missed / at risk: ${e.missed_or_at_risk.join("; ")}` : "",
        e.next_offer?.what ? `Next offer: ${e.next_offer.what}. How to win: ${e.next_offer.how_to_win || ""}` : "",
      ].filter(Boolean).join("\n");
      if (id) {
        try {
          const { data: cur } = await db().from("bd_deals").select("attachments").eq("id", id).single();
          const existing = Array.isArray((cur as any)?.attachments) ? (cur as any).attachments.filter((a: any) => a.kind !== "engagement") : [];
          const att = { name: "Engagement timeline", kind: "engagement", text: summary, engagement: e, added_at: new Date().toISOString() };
          const { data: updated } = await db().from("bd_deals").update({ attachments: [...existing, att], updated_at: new Date().toISOString() }).eq("id", id).select().single();
          return { success: true, engagement: e, deal: updated };
        } catch { /* ignore persist */ }
      }
      return { success: true, engagement: e };
    } catch (e: any) { return { success: false, error: e?.message || "engagement failed" }; }
  }

  if (action === "bd_aeo_check") {
    const siteUrl = String(body?.siteUrl || "").trim();
    if (!siteUrl) return { success: false, error: "No client site URL — detect it from the chat or add it." };
    try {
      const { aeoReadinessCheck } = await import("./bd-diagnostics.js");
      const r = await aeoReadinessCheck(siteUrl);
      if (!r.ok || !r.report) return { success: false, error: r.error || "AEO check failed." };
      const rep = r.report;
      noteCall(String(body?.id || "").trim()); await persistDiag(String(body?.id || "").trim(), "aeo", "AEO/GEO readiness", `AEO/GEO readiness for ${rep.site}: ${rep.signals.filter(s => s.ok).length}/${rep.signals.length} signals OK. Schema: ${rep.schema_types.join(", ") || "none"}. llms.txt: ${rep.llms_txt ? "yes" : "no"}. ${rep.robots_ai}. Top fixes: ${rep.recommendations.slice(0, 3).join("; ")}.`);
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
      noteCall(String(body?.id || "").trim()); await persistDiag(String(body?.id || "").trim(), "competitor", "Competitor snapshot", report.summary || `Competitor snapshot vs ${competitors.join(", ")}.`);
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
          noteCall(id); const issues = Object.entries(report.issues || {}).map(([k, v]: any) => `${v.count} ${String(k).replace(/_/g, " ")}`).join(", ");
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
          const f: any = r.strategy.deal_facts || {};
          const newStatus = STATUSES.includes(r.strategy.deal_state.stage) ? r.strategy.deal_state.stage : deal.status;
          await db().from("bd_deals").update({ strategy: r.strategy, status: newStatus, ...nameUpdate, industry: f.industry || deal.industry || null, country: f.location || deal.country || null, client_type: f.client_type || deal.client_type || null, updated_at: new Date().toISOString() }).eq("id", id);
          appendStage(id, newStatus);
        } catch { /* non-fatal */ }
        noteCall(id);
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

  if (action === "bd_deal_outcome") {
    const id = String(body?.id || "").trim();
    if (!id) return { success: false, error: "id required." };
    const outcome = body?.outcome === "won" ? "won" : "lost";
    const dealValue = Number(body?.deal_value) || null;
    const reason = String(body?.reason || "");
    const status = outcome === "won" ? "hired" : "lost";
    try {
      const { data: deal } = await db().from("bd_deals").select("*").eq("id", id).single();
      const d = deal as any;
      await db().from("bd_deals").update({ outcome, deal_value: dealValue, status, ...(outcome === "won" ? { won_reason: reason } : { lost_reason: reason }), updated_at: new Date().toISOString() }).eq("id", id);
      appendStage(id, status);
      try {
        const { analyzeOutcome } = await import("./bd-strategist.js");
        const a = await analyzeOutcome({ conversation: d?.conversation, outcome, dealValue: dealValue || undefined, reason, facts: JSON.stringify(d?.strategy?.deal_facts || {}) });
        if (a.ok) await db().from("bd_learnings").insert({ deal_id: id, client_name: d?.client_name || null, client_type: d?.client_type || d?.strategy?.deal_facts?.client_type || null, industry: d?.industry || d?.strategy?.deal_facts?.industry || null, project_type: a.project_type || null, outcome, deal_value: dealValue, what_worked: a.what_worked, what_failed: a.what_failed, why: a.why });
      } catch { /* learning is best-effort */ }
      return { success: true };
    } catch (e: any) { return { success: false, error: e?.message || "outcome failed" }; }
  }

  if (action === "bd_hod_report") {
    try {
      const { data: deals } = await db().from("bd_deals").select("id, client_name, status, outcome, deal_value, industry, country, client_type, api_calls, created_at, updated_at, stage_history").limit(2000);
      const { data: learnings } = await db().from("bd_learnings").select("*").order("created_at", { ascending: false }).limit(60);
      const list = (deals as any[]) || [];
      const now = Date.now();
      const won = list.filter(d => d.outcome === "won");
      const lost = list.filter(d => d.outcome === "lost");
      const active = list.filter(d => !["hired", "repeat", "lost", "archived"].includes(d.status));
      const earnings = won.reduce((s, d) => s + Number(d.deal_value || 0), 0);
      const lostValue = lost.reduce((s, d) => s + Number(d.deal_value || 0), 0);
      const decided = won.length + lost.length;
      const winRate = decided ? Math.round((won.length / decided) * 100) : 0;
      const totalApi = list.reduce((s, d) => s + Number(d.api_calls || 0), 0);
      const stages = ["lead", "qualifying", "proposal", "negotiating", "demo_requested", "closing", "hired", "repeat", "lost"];
      const funnel = stages.map(st => ({ stage: st, count: list.filter(d => d.status === st).length }));
      const convTimes = won.map(d => (new Date(d.updated_at).getTime() - new Date(d.created_at).getTime()) / 86400000).filter(x => x > 0);
      const avgConvDays = convTimes.length ? Math.round((convTimes.reduce((a, b) => a + b, 0) / convTimes.length) * 10) / 10 : 0;
      const hanging = active.filter(d => (now - new Date(d.updated_at).getTime()) > 4 * 86400000).map(d => ({ client_name: d.client_name, status: d.status, days: Math.floor((now - new Date(d.updated_at).getTime()) / 86400000) })).sort((a, b) => b.days - a.days).slice(0, 20);
      return { success: true, report: { total: list.length, active: active.length, won: won.length, lost: lost.length, winRate, earnings, lostValue, totalApi, avgApi: list.length ? Math.round(totalApi / list.length) : 0, funnel, byIndustry: aggBy(list, "industry"), byCountry: aggBy(won, "country"), avgConvDays, hanging, learnings: learnings || [] } };
    } catch (e: any) { return { success: false, error: e?.message || "report failed" }; }
  }

  return { success: false, error: `Unknown bd action: ${action}` };
}
